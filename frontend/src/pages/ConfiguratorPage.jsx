import { WrapConfigurator } from '@/components/configurator/WrapConfigurator';
import { Link } from 'react-router-dom';

export const ConfiguratorPage = () => {
  return (
    <div className="relative">
      <Link
        to="/dashboard"
        className="absolute left-4 top-4 z-[60] rounded-lg border border-[#E0B840]/60 bg-[#0D0D1A]/90 px-3 py-2 text-sm font-medium text-[#E0B840] shadow-lg backdrop-blur transition hover:bg-[#E0B840] hover:text-[#0D0D1A]"
      >
        ← Dashboard
      </Link>
      <WrapConfigurator />
    </div>
  );
};

export default ConfiguratorPage;
