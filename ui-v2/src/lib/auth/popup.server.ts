export async function handleAuthPopupRequest(): Promise<Response> {
  return new Response("<!DOCTYPE html><html><body><script>window.close();</script></body></html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
