(() => {
  const params = new URLSearchParams(location.search);
  const payload = { type: "mindpace:spotify", state: params.get("state"), code: params.get("code"), error: params.get("error") };
  history.replaceState(null, "", location.pathname);
  const message = document.getElementById("message");
  if (!window.opener || !payload.state) {
    message.textContent = "Return to MindPace and start the Spotify connection again.";
    return;
  }
  const origins = [location.origin];
  // The local app supports localhost, but Spotify requires a numeric loopback redirect.
  if (location.hostname === "127.0.0.1") origins.push(`${location.protocol}//localhost:${location.port}`);
  window.addEventListener("message", event => {
    if (event.source === window.opener && origins.includes(event.origin) && event.data?.type === "mindpace:spotify-received") {
      message.textContent = "Return to MindPace to choose your music. You can close this window.";
      window.close();
    }
  });
  for (const origin of origins) window.opener.postMessage(payload, origin);
  message.textContent = "Return to MindPace to finish connecting. If nothing happens, close this window and try connecting again.";
})();
