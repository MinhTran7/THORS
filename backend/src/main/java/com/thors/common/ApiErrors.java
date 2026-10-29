package com.thors.common;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiErrors {
  private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> api(ApiException e) {
    return ResponseEntity.status(e.status).body(Map.of("code", e.code, "message", e.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> validation(MethodArgumentNotValidException e) {
    return ResponseEntity.badRequest()
            .body(
                    Map.of(
                            "code",
                            "VALIDATION",
                            "message",
                            e.getBindingResult().getFieldErrors().stream()
                                    .map(x -> x.getDefaultMessage())
                                    .findFirst()
                                    .orElse("Thông tin không hợp lệ.")));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> duplicate(DataIntegrityViolationException e) {
    return ResponseEntity.status(409)
            .body(
                    Map.of(
                            "code",
                            "CONFLICT",
                            "message",
                            "Thông tin đã được sử dụng hoặc có dữ liệu liên quan."));
  }

  @ExceptionHandler({
          org.springframework.web.multipart.MaxUploadSizeExceededException.class,
          org.springframework.http.converter.HttpMessageNotReadableException.class,
          org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<?> requestFormat(Exception e) {
    return ResponseEntity.badRequest()
            .body(
                    Map.of(
                            "code",
                            "INVALID_REQUEST",
                            "message",
                            e instanceof org.springframework.web.multipart.MaxUploadSizeExceededException
                                    ? "Ảnh tối đa 5 MB mỗi lần tải."
                                    : "Thông tin gửi lên không đúng định dạng."));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unexpected(Exception e) {
      log.error("Unhandled request failure", e);
    return ResponseEntity.internalServerError()
            .body(
                    Map.of(
                            "code", "SERVER_ERROR", "message", "Không thể xử lý yêu cầu. Vui lòng thử lại."));
  }
}
