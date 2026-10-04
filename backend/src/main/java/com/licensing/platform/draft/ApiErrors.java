package com.licensing.platform.draft;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.RestControllerAdvice;

class ApiException extends RuntimeException {
    final HttpStatus status;
    final String code;

    ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

class ValidationException extends ApiException {
    final Map<String, String> fields;

    ValidationException(Map<String, String> fields) {
        super(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "validation_failed",
                "Correct the highlighted fields");
        this.fields = fields;
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException exception) {
        Map<String, String> fieldErrors =
                exception instanceof ValidationException validation
                        ? validation.fields
                        : Map.of();
        return ResponseEntity.status(exception.status)
                .body(
                        Map.of(
                                "error", exception.code,
                                "message", exception.getMessage(),
                                "fieldErrors", fieldErrors));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, Object>> tooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of(
                        "error", "file_too_large",
                        "message", "Files must be no larger than 10,000,000 bytes",
                        "fieldErrors", Map.of()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, Object>> malformed() {
        return ResponseEntity.badRequest()
                .body(
                        Map.of(
                                "error", "invalid_request",
                                "message", "Request body is invalid",
                                "fieldErrors", Map.of()));
    }
}
