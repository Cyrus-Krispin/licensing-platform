package com.licensing.platform.draft;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import javax.imageio.stream.ImageInputStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Isolated, resource-capped structural parser. Its exit status is the
 * protocol.
 */
public final class EvidenceValidationWorker {
  private static final long PDF_MEMORY_BYTES = 8_000_000;
  private static final long PDF_TOTAL_CACHE_BYTES = 32_000_000;

  private EvidenceValidationWorker() {}

  public static void main(String[] args) {
    if (args.length < 2 || args.length > 3) {
      System.exit(2);
    }
    try {
      if (args.length == 3 && "--sleep".equals(args[2])) {
        Thread.sleep(60_000);
      }
      Path path = Path.of(args[0]);
      if ("application/pdf".equals(args[1])) {
        parsePdf(path.toFile());
      } else {
        parseImage(path.toFile());
      }
      System.exit(0);
    } catch (Exception | LinkageError failure) {
      System.err.println("invalid");
      System.exit(3);
    }
  }

  private static void parsePdf(File file) throws Exception {
    MemoryUsageSetting budget =
        MemoryUsageSetting.setupMixed(PDF_MEMORY_BYTES, PDF_TOTAL_CACHE_BYTES)
            .setTempDir(file.getParentFile());
    try (PDDocument document = Loader.loadPDF(file, "", budget.streamCache)) {
      if (document.isEncrypted() || document.getNumberOfPages() < 1 ||
          document.getNumberOfPages() > 2_000) {
        throw new IllegalArgumentException("unsupported PDF structure");
      }
    }
  }

  private static void parseImage(File file) throws Exception {
    try (ImageInputStream input = ImageIO.createImageInputStream(file)) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) {
        throw new IllegalArgumentException("unsupported image structure");
      }
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        int width = reader.getWidth(0);
        int height = reader.getHeight(0);
        if (width < 1 || height < 1 || width > 20_000 || height > 20_000 ||
            (long)width * height > 100_000_000L) {
          throw new IllegalArgumentException("image dimensions exceed budget");
        }
        BufferedImage image = reader.read(0);
        if (image == null) {
          throw new IllegalArgumentException("image cannot be decoded");
        }
      } finally {
        reader.dispose();
      }
    }
  }
}
