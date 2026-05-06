<?php

function build_reset_email_html(string $code, string $productName = 'Aquabeast WRS'): string {
  $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
  $safeProduct = htmlspecialchars($productName, ENT_QUOTES, 'UTF-8');

  return <<<HTML
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Password reset</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F8FF;font-family:Arial,Helvetica,sans-serif;color:#0B1B3A;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your {$safeProduct} password reset code is {$safeCode}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F8FF;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:10px 6px 16px 6px;">
                <div style="font-weight:800;font-size:20px;letter-spacing:-0.2px;">{$safeProduct}</div>
                <div style="margin-top:6px;color:#6A7A95;font-size:13px;">Password reset verification</div>
              </td>
            </tr>

            <tr>
              <td style="background:#FFFFFF;border:1px solid #E7EEF9;border-radius:18px;padding:18px 18px 16px 18px;">
                <div style="font-size:18px;font-weight:800;">Reset your password</div>
                <div style="margin-top:10px;font-size:14px;line-height:20px;color:#0B1B3A;">
                  Use this code to reset your password. For your security, this code expires in <b>10 minutes</b>.
                </div>

                <div style="margin-top:16px;background:rgba(18,101,214,0.06);border:1px solid rgba(18,101,214,0.16);border-radius:16px;padding:14px;text-align:center;">
                  <div style="color:#6A7A95;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reset code</div>
                  <div style="margin-top:8px;font-size:30px;font-weight:900;letter-spacing:6px;color:#1265D6;">{$safeCode}</div>
                </div>

                <div style="margin-top:14px;color:#6A7A95;font-size:12px;line-height:18px;">
                  If you didn't request a password reset, you can ignore this email. Your account remains secure.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 6px 0 6px;color:#6A7A95;font-size:12px;line-height:18px;text-align:center;">
                © {$safeProduct}. This is an automated message—please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
HTML;
}

