import FaqTabs from './FaqTabs';

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full px-6 pt-6">
        <FaqTabs />
      </div>
      {children}
    </div>
  );
}
