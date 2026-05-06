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
$code = trim((string)($body['code'] ?? ''));
$newPassword = (string)($body['newPassword'] ?? '');

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  json_response(400, ['ok' => false, 'error' => 'invalid_email', 'message' => 'Enter a valid email.']);
}
if (!preg_match('/^\d{6}$/', $code)) {
  json_response(400, ['ok' => false, 'error' => 'invalid_code', 'message' => 'Enter the 6-digit code.']);
}
if (strlen($newPassword) < 6) {
  json_response(400, ['ok' => false, 'error' => 'weak_password', 'message' => 'Password must be at least 6 characters.']);
}

try {
  // Lookup latest valid code row for email
  $sel = supabase_request(
    'GET',
    '/rest/v1/password_reset_codes?email=eq.' . rawurlencode($email) . '&used_at=is.null&order=created_at.desc&limit=1',
    null
  );
  if ($sel['status'] < 200 || $sel['status'] >= 300 || !is_array($sel['body'])) {
    json_response(400, ['ok' => false, 'error' => 'invalid', 'message' => 'Invalid code.']);
  }
  $row = $sel['body'][0] ?? null;
  if (!is_array($row)) {
    json_response(400, ['ok' => false, 'error' => 'invalid', 'message' => 'Invalid code.']);
  }
  $expiresAt = (string)($row['expires_at'] ?? '');
  $createdId = (string)($row['id'] ?? '');
  $uid = (string)($row['user_id'] ?? '');
  $expected = (string)($row['code_hash'] ?? '');

  if (!$createdId || !$uid || !$expected) {
    json_response(400, ['ok' => false, 'error' => 'invalid', 'message' => 'Invalid code.']);
  }

  $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
  $exp = $expiresAt ? new DateTimeImmutable($expiresAt) : null;
  if (!$exp || $exp < $now) {
    json_response(400, ['ok' => false, 'error' => 'expired', 'message' => 'Code expired. Request a new one.']);
  }

  $incomingHash = hash_code($code, $email);
  if (!hash_equals($expected, $incomingHash)) {
    json_response(400, ['ok' => false, 'error' => 'invalid', 'message' => 'Invalid code.']);
  }

  // Mark used first (prevents reuse if password update fails later; user can request again)
  $patch = supabase_request(
    'PATCH',
    '/rest/v1/password_reset_codes?id=eq.' . rawurlencode($createdId),
    ['used_at' => $now->format(DateTimeInterface::ATOM)]
  );
  if ($patch['status'] < 200 || $patch['status'] >= 300) {
    json_response(500, ['ok' => false, 'error' => 'server', 'message' => 'Could not finalize reset.']);
  }

  // Update Supabase Auth password (admin)
  $upd = supabase_request('PUT', '/auth/v1/admin/users/' . rawurlencode($uid), ['password' => $newPassword]);
  if ($upd['status'] < 200 || $upd['status'] >= 300) {
    json_response(500, ['ok' => false, 'error' => 'server', 'message' => 'Could not set new password.']);
  }

  json_response(200, ['ok' => true, 'message' => 'Password updated. You can log in now.']);
} catch (Throwable $e) {
  json_response(500, ['ok' => false, 'error' => 'server', 'message' => 'Could not reset password.']);
}

