<?php

require __DIR__ . '/_bootstrap.php';

cors_headers();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$body = read_json_body();
$email = strtolower(trim((string)($body['email'] ?? '')));
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  json_response(400, ['ok' => false, 'error' => 'invalid_email', 'message' => 'Enter a valid email.']);
}

// Always respond OK for privacy, but still attempt to issue a code if user exists.
try {
  $code = random_reset_code();
  $codeHash = hash_code($code, $email);

  // Find user by email (small install: scan first 1000 users).
  $usersRes = supabase_request('GET', '/auth/v1/admin/users?page=1&per_page=1000', null);
  if ($usersRes['status'] < 200 || $usersRes['status'] >= 300 || !is_array($usersRes['body'])) {
    throw new RuntimeException('Could not read users');
  }
  $uid = null;
  foreach ($usersRes['body'] as $u) {
    if (is_array($u) && strtolower((string)($u['email'] ?? '')) === $email) {
      $uid = (string)($u['id'] ?? '');
      break;
    }
  }

  if ($uid) {
    $expiresAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+10 minutes')->format(DateTimeInterface::ATOM);
    $insert = [
      'user_id' => $uid,
      'email' => $email,
      'code_hash' => $codeHash,
      'expires_at' => $expiresAt,
    ];
    $insRes = supabase_request('POST', '/rest/v1/password_reset_codes', $insert);
    if ($insRes['status'] < 200 || $insRes['status'] >= 300) {
      throw new RuntimeException('Could not save reset code');
    }
    send_reset_email($email, $code);
  }

  json_response(200, [
    'ok' => true,
    'message' => 'If that email exists, we sent a 6-digit code.',
  ]);
} catch (Throwable $e) {
  // Avoid leaking details to clients.
  json_response(200, [
    'ok' => true,
    'message' => 'If that email exists, we sent a 6-digit code.',
  ]);
}

