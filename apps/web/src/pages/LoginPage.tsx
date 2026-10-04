export default function LoginPage() {
  return (
    <div>
      <h1>Log in</h1>
      <p>
        <a href="/api/auth/login/google">Continue with Google</a>
      </p>
      <p>
        The link works once the server has GOOGLE_CLIENT_ID and
        GOOGLE_CLIENT_SECRET configured; otherwise it explains the setup.
      </p>
    </div>
  );
}
