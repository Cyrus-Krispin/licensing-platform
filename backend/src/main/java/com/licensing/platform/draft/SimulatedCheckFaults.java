package com.licensing.platform.draft;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Package test seam: no HTTP, header, or configuration activation exists. */
@Component
class SimulatedCheckFaults {
  private final Set<UUID> failures = ConcurrentHashMap.newKeySet();

  void failOnce(UUID upload) {
    failures.add(upload);
  }

  boolean fail(UUID upload) {
    return failures.remove(upload);
  }

  void clear() {
    failures.clear();
  }
}
