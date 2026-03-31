import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice } from '../utils/priceCalculator';

export const PriceTag = ({ price, label = 'Totale' }) => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#AAA] text-sm font-medium">{label}:</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={price}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.2, opacity: 0 }}
          transition={{ duration: 0.2, type: 'spring', stiffness: 500 }}
          className="text-[#E0B840] text-xl font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
        >
          {formatPrice(price)}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export default PriceTag;
