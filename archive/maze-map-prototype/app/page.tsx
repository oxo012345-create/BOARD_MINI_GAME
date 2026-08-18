export default function Home() {
  return (
    <main
      className="game-frame-shell"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#061020",
      }}
    >
      <iframe
        className="game-frame"
        src="/game-characters.html?select=1"
        title="미로의 배달부"
        allow="autoplay; fullscreen"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </main>
  );
}
