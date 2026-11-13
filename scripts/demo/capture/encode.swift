// encode.swift: AVFoundation fallback for the demo edit (WO-35b), used when ffmpeg is absent.
// encode.mjs compiles it with `swiftc -O` and drives it over pipes; frames are raw RGBA, 8 bit, no row padding.
//
//   nectar-encode encode --width W --height H [--fps 30] [--bitrate 16000000] [--keyint 60] <out.mp4>
//       reads W*H*4-byte RGBA frames on stdin until EOF; H.264 High (auto level), 420v (video range), BT.709 tags,
//       presentation time = frame index / fps (exact CFR), shouldOptimizeForNetworkUse = true (moov first).
//   nectar-encode decode [--every N] <in.mp4>
//       writes every Nth decoded frame (default 1) to stdout as RGBA; frame size = `probe` width x height.
//   nectar-encode probe <in.mp4>
//       prints JSON: width, height, fps, duration_s, frames, codec, profile_idc, level_idc, full_range, matrix,
//       min/max frame delta (to prove CFR), estimated bitrate.
import AVFoundation
import Accelerate
import CoreMedia
import CoreVideo
import Foundation

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write(("nectar-encode: " + msg + "\n").data(using: .utf8)!)
  exit(1)
}

func opt(_ args: [String], _ name: String, _ def: Int) -> Int {
  if let i = args.firstIndex(of: name), i + 1 < args.count, let v = Int(args[i + 1]) { return v }
  return def
}

func positional(_ args: [String]) -> [String] {
  var out: [String] = []
  var i = 0
  while i < args.count {
    if args[i].hasPrefix("--") { i += 2 } else { out.append(args[i]); i += 1 }
  }
  return out
}

func videoTrack(_ path: String) -> (AVURLAsset, AVAssetTrack) {
  let asset = AVURLAsset(url: URL(fileURLWithPath: path))
  guard let track = asset.tracks(withMediaType: .video).first else { fail("no video track in input") }
  return (asset, track)
}

enum ReadResult { case full, eof }

func readFull(_ fd: Int32, _ buf: UnsafeMutableRawPointer, _ n: Int) -> ReadResult {
  var got = 0
  while got < n {
    let r = read(fd, buf + got, n - got)
    if r == 0 {
      if got == 0 { return .eof }
      fail("partial frame on stdin (\(got) of \(n) bytes)")
    }
    if r < 0 {
      if errno == EINTR { continue }
      fail("stdin read error \(errno)")
    }
    got += r
  }
  return .full
}

func writeFull(_ fd: Int32, _ buf: UnsafeRawPointer, _ n: Int) {
  var put = 0
  while put < n {
    let r = write(fd, buf + put, n - put)
    if r < 0 {
      if errno == EINTR { continue }
      exit(0)  // reader went away (e.g. contact sheet took what it needed)
    }
    put += r
  }
}

// MARK: encode

func encode(_ args: [String]) {
  let w = opt(args, "--width", 1920), h = opt(args, "--height", 1080)
  let fps = Int32(opt(args, "--fps", 30)), bitrate = opt(args, "--bitrate", 16_000_000)
  let keyint = opt(args, "--keyint", 60)
  guard let out = positional(args).first else { fail("encode: output path missing") }
  if w % 2 != 0 || h % 2 != 0 { fail("encode: width and height must be even for 4:2:0") }
  let url = URL(fileURLWithPath: out)
  try? FileManager.default.removeItem(at: url)
  let writer: AVAssetWriter
  do { writer = try AVAssetWriter(outputURL: url, fileType: .mp4) } catch { fail("AVAssetWriter: \(error)") }
  writer.shouldOptimizeForNetworkUse = true
  let compression: [String: Any] = [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoExpectedSourceFrameRateKey: Int(fps),
    AVVideoMaxKeyFrameIntervalKey: keyint,
    AVVideoAllowFrameReorderingKey: true,
    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
  ]
  let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: w,
    AVVideoHeightKey: h,
    AVVideoCompressionPropertiesKey: compression,
    AVVideoColorPropertiesKey: [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
  ]
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
  input.expectsMediaDataInRealTime = false
  input.mediaTimeScale = fps * 512  // 15360 at 30 fps, as x264/ffmpeg mp4 muxing does; 512 ticks per frame
  let attrs: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    kCVPixelBufferWidthKey as String: w,
    kCVPixelBufferHeightKey as String: h,
    kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
  ]
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
  guard writer.canAdd(input) else { fail("writer refuses the H.264 input settings") }
  writer.add(input)
  guard writer.startWriting() else { fail("startWriting: \(String(describing: writer.error))") }
  writer.startSession(atSourceTime: .zero)
  guard let pool = adaptor.pixelBufferPool else { fail("no pixel buffer pool") }

  // RGBA -> 4:2:0 bi-planar, BT.709 matrix, video range (Y' 16-235, CbCr 16-240).
  var pixelRange = vImage_YpCbCrPixelRange(
    Yp_bias: 16, CbCr_bias: 128, YpRangeMax: 235, CbCrRangeMax: 240, YpMax: 235, YpMin: 16, CbCrMax: 240, CbCrMin: 16)
  var info = vImage_ARGBToYpCbCr()
  let ge = vImageConvert_ARGBToYpCbCr_GenerateConversion(
    kvImage_ARGBToYpCbCrMatrix_ITU_R_709_2, &pixelRange, &info, kvImageARGB8888, kvImage420Yp8_CbCr8,
    vImage_Flags(kvImageNoFlags))
  if ge != kvImageNoError { fail("vImage conversion setup \(ge)") }
  let permute: [UInt8] = [3, 0, 1, 2]  // source bytes are R,G,B,A; vImage wants A,R,G,B

  let frameBytes = w * h * 4
  let buf = UnsafeMutableRawPointer.allocate(byteCount: frameBytes, alignment: 64)
  defer { buf.deallocate() }
  var n: Int64 = 0
  while readFull(0, buf, frameBytes) == .full {
    while !input.isReadyForMoreMediaData { usleep(1000) }
    var pbOut: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbOut) == kCVReturnSuccess, let pb = pbOut else {
      fail("pixel buffer allocation")
    }
    CVBufferSetAttachment(pb, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
    CVPixelBufferLockBaseAddress(pb, [])
    var src = vImage_Buffer(data: buf, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: w * 4)
    var yp = vImage_Buffer(
      data: CVPixelBufferGetBaseAddressOfPlane(pb, 0), height: vImagePixelCount(h), width: vImagePixelCount(w),
      rowBytes: CVPixelBufferGetBytesPerRowOfPlane(pb, 0))
    var cbcr = vImage_Buffer(
      data: CVPixelBufferGetBaseAddressOfPlane(pb, 1), height: vImagePixelCount(h / 2), width: vImagePixelCount(w / 2),
      rowBytes: CVPixelBufferGetBytesPerRowOfPlane(pb, 1))
    let ce = vImageConvert_ARGB8888To420Yp8_CbCr8(&src, &yp, &cbcr, &info, permute, vImage_Flags(kvImageNoFlags))
    CVPixelBufferUnlockBaseAddress(pb, [])
    if ce != kvImageNoError { fail("vImage convert \(ce)") }
    if !adaptor.append(pb, withPresentationTime: CMTime(value: n, timescale: fps)) {
      fail("append frame \(n): \(String(describing: writer.error))")
    }
    n += 1
  }
  if n == 0 { fail("no frames on stdin") }
  input.markAsFinished()
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if writer.status != .completed { fail("finishWriting: \(String(describing: writer.error))") }
  print("{\"frames\":\(n),\"fps\":\(fps),\"width\":\(w),\"height\":\(h),\"bitrate\":\(bitrate)}")
}

// MARK: decode

func decode(_ args: [String]) {
  guard let path = positional(args).first else { fail("decode: input path missing") }
  let every = max(1, opt(args, "--every", 1))
  let (asset, track) = videoTrack(path)
  let reader: AVAssetReader
  do { reader = try AVAssetReader(asset: asset) } catch { fail("AVAssetReader: \(error)") }
  let output = AVAssetReaderTrackOutput(
    track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { fail("startReading: \(String(describing: reader.error))") }
  let w = Int(track.naturalSize.width), h = Int(track.naturalSize.height)
  let out = UnsafeMutableRawPointer.allocate(byteCount: w * h * 4, alignment: 64)
  defer { out.deallocate() }
  let map: [UInt8] = [2, 1, 0, 3]  // BGRA -> RGBA
  var idx = 0
  while let sb = output.copyNextSampleBuffer() {
    defer { idx += 1 }
    if idx % every != 0 { continue }
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let pw = CVPixelBufferGetWidth(pb), ph = CVPixelBufferGetHeight(pb)
    if pw < w || ph < h { fail("decoded frame \(pw)x\(ph) smaller than track \(w)x\(h)") }
    var s = vImage_Buffer(
      data: CVPixelBufferGetBaseAddress(pb), height: vImagePixelCount(h), width: vImagePixelCount(w),
      rowBytes: CVPixelBufferGetBytesPerRow(pb))
    var d = vImage_Buffer(data: out, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: w * 4)
    let e = vImagePermuteChannels_ARGB8888(&s, &d, map, vImage_Flags(kvImageNoFlags))
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    if e != kvImageNoError { fail("vImage permute \(e)") }
    writeFull(1, out, w * h * 4)
  }
  if reader.status == .failed { fail("decode: \(String(describing: reader.error))") }
}

// MARK: probe

func probe(_ args: [String]) {
  guard let path = positional(args).first else { fail("probe: input path missing") }
  let (asset, track) = videoTrack(path)
  var codec = "?", profile = -1, level = -1, fullRange = false, matrix = ""
  if let fdAny = track.formatDescriptions.first {
    let fd = fdAny as! CMFormatDescription
    let st = CMFormatDescriptionGetMediaSubType(fd)
    codec = String(bytes: [UInt8(st >> 24 & 255), UInt8(st >> 16 & 255), UInt8(st >> 8 & 255), UInt8(st & 255)], encoding: .ascii) ?? "?"
    if let atoms = CMFormatDescriptionGetExtension(fd, extensionKey: kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms) as? [String: Any],
      let avcC = atoms["avcC"] as? Data, avcC.count > 3
    {
      profile = Int(avcC[avcC.startIndex + 1])
      level = Int(avcC[avcC.startIndex + 3])
    }
    fullRange = (CMFormatDescriptionGetExtension(fd, extensionKey: kCMFormatDescriptionExtension_FullRangeVideo) as? Bool) ?? false
    matrix = (CMFormatDescriptionGetExtension(fd, extensionKey: kCMFormatDescriptionExtension_YCbCrMatrix) as? String) ?? ""
  }
  // Count samples and check presentation-time spacing without decoding.
  var pts: [Double] = []
  if let reader = try? AVAssetReader(asset: asset) {
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    reader.add(output)
    if reader.startReading() {
      while let sb = output.copyNextSampleBuffer() {
        if CMSampleBufferGetNumSamples(sb) > 0 { pts.append(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))) }
      }
    }
  }
  pts.sort()
  var dmin = 0.0, dmax = 0.0
  if pts.count > 1 {
    dmin = .infinity
    for i in 1..<pts.count {
      let d = pts[i] - pts[i - 1]
      dmin = min(dmin, d)
      dmax = max(dmax, d)
    }
  }
  let o: [String: Any] = [
    "width": Int(track.naturalSize.width), "height": Int(track.naturalSize.height),
    "fps": Double(track.nominalFrameRate), "duration_s": CMTimeGetSeconds(asset.duration), "frames": pts.count,
    "codec": codec, "profile_idc": profile, "level_idc": level, "full_range": fullRange, "matrix": matrix,
    "frame_delta_min_s": dmin, "frame_delta_max_s": dmax, "bitrate": Double(track.estimatedDataRate),
  ]
  let data = try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

let argv = Array(CommandLine.arguments.dropFirst())
switch argv.first {
case "encode": encode(Array(argv.dropFirst()))
case "decode": decode(Array(argv.dropFirst()))
case "probe": probe(Array(argv.dropFirst()))
default: fail("usage: nectar-encode encode|decode|probe ... (see header)")
}
