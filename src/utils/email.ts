import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[MOCK EMAIL] To: ${to}`);
      console.log(`[MOCK EMAIL] Subject: ${subject}`);
      console.log(`[MOCK EMAIL] Content: ${html}\n`);
      return true;
    }

    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function sendReauthorizeNotification(email: string, provider: string): Promise<void> {
  const subject = `请重新授权您的${provider}账号`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>账号安全提醒</h2>
      <p>您好，</p>
      <p>我们检测到您的 <strong>${provider}</strong> 授权已过期或失效，无法自动刷新。</p>
      <p>为了继续使用 <strong>${provider}</strong> 账号登录，您需要：</p>
      <ol>
        <li>使用邮箱和密码登录您的账号（如果您还没有设置密码，可以通过"忘记密码"功能设置）</li>
        <li>进入个人中心的账号管理页面</li>
        <li>重新绑定您的 <strong>${provider}</strong> 账号</li>
      </ol>
      <p>如果您有任何疑问，请联系我们的客服团队。</p>
      <p>感谢您的使用！</p>
      <hr>
      <p style="color: #888; font-size: 12px;">此邮件由系统自动发送，请勿直接回复。</p>
    </div>
  `;
  await sendEmail(email, subject, html);
}
