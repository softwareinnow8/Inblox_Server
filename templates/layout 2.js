export const emailLayout = (content) => `
<!DOCTYPE html>
<html>
<head>
<style>
  body {
    margin: 0;
    padding: 0;
    background: #f5f7fb;
    font-family: Arial, sans-serif;
  }
  .card {
    max-width: 640px;
    margin: 32px auto;
    background: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
  }
  .header {
    background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
    color: #ffffff;
    padding: 24px;
    text-align: center;
  }
  .body {
    padding: 30px;
  }
  .footer {
    padding: 20px;
    text-align: center;
    font-size: 13px;
    background: #f9fafb;
  }
</style>
</head>
<body>
  <div class="card">
    ${content}
  </div>
</body>
</html>
`;
