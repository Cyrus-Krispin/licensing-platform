package com.licensing.platform.draft;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Component;

/** Test-only one-shot fault seams; production remains {@link Failure#NONE}. */
@Component
public class EvidenceFaults {
  public enum Failure {
    NONE,
    DISK_WRITE,
    DATABASE_ROLLBACK,
    COMMITTED_RESPONSE,
    AMBIGUOUS_COMMIT,
    PARSER_TIMEOUT
  }

  private final AtomicReference<Failure> next =
      new AtomicReference<>(Failure.NONE);

  public void failNext(Failure failure) { next.set(failure); }

  public void reset() { next.set(Failure.NONE); }

  void beforeDiskWrite() throws IOException {
    if (next.compareAndSet(Failure.DISK_WRITE, Failure.NONE)) {
      throw new IOException("injected disk write failure");
    }
  }

  void beforeReceiptInsert() {
    if (next.compareAndSet(Failure.DATABASE_ROLLBACK, Failure.NONE)) {
      throw new DataAccessResourceFailureException(
          "injected database rollback");
    }
  }

  boolean consumeParserTimeout() {
    return next.compareAndSet(Failure.PARSER_TIMEOUT, Failure.NONE);
  }

  void afterCommittedTransaction() {
    Failure failure = next.get();
    if ((failure == Failure.COMMITTED_RESPONSE ||
         failure == Failure.AMBIGUOUS_COMMIT) &&
        next.compareAndSet(failure, Failure.NONE)) {
      throw new IllegalStateException("injected post-commit uncertainty");
    }
  }
}
