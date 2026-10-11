package com.thors.module.auth.entity;

import java.io.Serializable;

public record OtpChallenge(
    String codeId,
    int userId,
    String purpose,
    String channel,
    String destination,
    long authVersion,
    String context)
    implements Serializable {}
