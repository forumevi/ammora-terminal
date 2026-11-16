import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-lg p-8 text-center">
      <p className="text-lg font-semibold text-white">Not found</p>
      <p className="mt-2 text-sm text-zinc-400">That address is not an Ammora V4 launch from the reviewed GIWA LaunchFactory, or it has not been indexed yet.</p>
      <Link href="/" className="btn-primary mt-4">Back to Discover</Link>
    </div>
  );
}
