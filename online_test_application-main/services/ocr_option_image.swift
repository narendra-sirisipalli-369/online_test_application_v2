import AppKit
import Foundation
import Vision
guard CommandLine.arguments.count == 2, let image = NSImage(contentsOfFile: CommandLine.arguments[1]), let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(2) }
let request = VNRecognizeTextRequest { request, _ in
  print((request.results as? [VNRecognizedTextObservation] ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try? VNImageRequestHandler(cgImage: cgImage).perform([request])
