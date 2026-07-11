import { SpinnerPanel } from '@/components/Spinner';

export default function RouteLoading() {
  return (
    <div className="route-loading flex flex-1 items-center justify-center p-8">
      <SpinnerPanel />
    </div>
  );
}
