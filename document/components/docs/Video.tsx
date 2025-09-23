export default function YouTube({ id }: { id: string }) {
  return (
    <div className="border-2 border-black">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube Video Player"
        allowFullScreen
      />
    </div>
  );
}
