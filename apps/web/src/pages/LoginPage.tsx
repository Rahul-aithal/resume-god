export default function LoginPage() {
  return (
    <div>
      <h1>Log in</h1>
      <p>
        <a href="/api/auth/login/google">Continue with Google</a>
      </p>
      <p>
        <a href="/api/auth/login/github">Continue with GitHub</a>
      </p>
      <p>
        Providers appear here only after OAuth client IDs are configured on the
        server; otherwise the links explain the setup.
      </p>
    </div>
  );
}
