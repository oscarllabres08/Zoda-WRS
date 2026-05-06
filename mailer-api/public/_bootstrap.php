<?php

declare(strict_types=1);

use Dotenv\Dotenv;

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/emailTemplate.php';

$dotenv = Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

function env_string(string $key, string $default = ''): string {
  $v = $_ENV[$key] ?? getenv($key) ?? $default;
  return is_string($v) ? $v : $default;
}

function json_response(int $status, array $payload): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

function cors_headers(): void {
  $origins = array_filter(array_map('trim', explode(',', env_string('CORS_ORIGINS', ''))));
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && in_array($origin, $origins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
  }
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function random_reset_code(): string {
  return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function hash_code(string $code, string $email): string {
  $pepper = env_string('RESET_CODE_PEPPER', 'local-dev-pepper');
  return hash('sha256', $pepper . '|' . strtolower(trim($email)) . '|' . trim($code));
}

function supabase_request(string $method, string $path, ?array $jsonBody = null): array {
  $base = rtrim(env_string('SUPABASE_URL'), '/');
  $key = env_string('SUPABASE_SERVICE_ROLE_KEY');
  if (!$base || !$key) {
    throw new RuntimeException('Supabase env not configured');
  }

  $url = $base . $path;
  $headers = [
    'Authorization: Bearer ' . $key,
    'apikey: ' . $key,
    'Content-Type: application/json',
  ];

  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

  if ($jsonBody !== null) {
    $body = json_encode($jsonBody, JSON_UNESCAPED_SLASHES);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  }

  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);

  if ($resp === false) {
    throw new RuntimeException('HTTP error: ' . ($err ?: 'unknown'));
  }

  $decoded = json_decode($resp, true);
  return ['status' => (int) $status, 'body' => $decoded, 'raw' => $resp];
}

function send_reset_email(string $toEmail, string $code): void {
  $host = env_string('SMTP_HOST', 'smtp.gmail.com');
  $port = (int) env_string('SMTP_PORT', '587');
  $secure = env_string('SMTP_SECURE', 'tls');
  $username = env_string('SMTP_USERNAME');
  $appPassword = env_string('SMTP_APP_PASSWORD');
  $from = env_string('MAIL_FROM', $username);
  $fromName = env_string('MAIL_FROM_NAME', 'Aquabeast WRS');

  if (!$username || !$appPassword || !$from) {
    throw new RuntimeException('SMTP env not configured');
  }

  $mail = new PHPMailer\PHPMailer\PHPMailer(true);
  $mail->isSMTP();
  $mail->Host = $host;
  $mail->SMTPAuth = true;
  $mail->Username = $username;
  $mail->Password = $appPassword;
  $mail->Port = $port;
  if ($secure) $mail->SMTPSecure = $secure;
  $mail->CharSet = 'UTF-8';
  $mail->setFrom($from, $fromName);
  $mail->addAddress($toEmail);
  $mail->Subject = "{$fromName} password reset code";
  $mail->isHTML(true);
  $mail->Body = build_reset_email_html($code, $fromName);
  $mail->AltBody = "Your password reset code is {$code}. It expires in 10 minutes.";
  $mail->send();
}

