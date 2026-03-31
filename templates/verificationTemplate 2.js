import { emailLayout } from "./layout.js";

export const verificationTemplate = ({ firstName, url, appName }) => {
  return emailLayout(`
    <div class="header">
      <h1>Welcome to ${appName}</h1>
    </div>
    <div class="body">
      <h2>Hi ${firstName},</h2>
      <p>Verify your email to start building.</p>
      <a href="${url}">Verify Email</a>
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} ${appName}
    </div>
  `);
};
