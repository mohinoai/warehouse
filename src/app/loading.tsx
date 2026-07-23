import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <section className="px-4 py-6 sm:px-7">
      <div className="mb-6 grid grid-cols-12 gap-3">
        <Skeleton className="col-span-12 h-28 sm:col-span-6 lg:col-span-3" />
        <Skeleton className="col-span-12 h-28 sm:col-span-6 lg:col-span-3" />
        <Skeleton className="col-span-12 h-28 sm:col-span-6 lg:col-span-3" />
        <Skeleton className="col-span-12 h-28 sm:col-span-6 lg:col-span-3" />
      </div>
      <Skeleton className="h-72 w-full" />
    </section>
  );
}
