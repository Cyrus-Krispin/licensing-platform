package com.licensing.platform.draft;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

class ApiException extends RuntimeException { final HttpStatus status; final String code; ApiException(HttpStatus s,String c,String m){super(m);status=s;code=c;} }
class ValidationException extends ApiException { final Map<String,String> fields; ValidationException(Map<String,String> f){super(HttpStatus.UNPROCESSABLE_ENTITY,"validation_failed","Correct the highlighted fields");fields=f;} }

@RestControllerAdvice
class ApiErrors {
 @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,Object>> api(ApiException e){ return ResponseEntity.status(e.status).body(Map.of("error",e.code,"message",e.getMessage(),"fieldErrors",e instanceof ValidationException v?v.fields:Map.of())); }
 @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class) ResponseEntity<Map<String,Object>> malformed(){ return ResponseEntity.badRequest().body(Map.of("error","invalid_request","message","Request body is invalid","fieldErrors",Map.of())); }
}
