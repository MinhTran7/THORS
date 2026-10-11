package com.thors;

import com.thors.config.Settings;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(Settings.class)
public class ThorsApplication {
  public static void main(String[] args) {
    SpringApplication.run(ThorsApplication.class, args);
  }
}
