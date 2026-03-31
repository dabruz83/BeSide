import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Veicolo', short: '1' },
  { label: 'Colore', short: '2' },
  { label: 'Pellicola', short: '3' },
  { label: 'Zone', short: '4' },
  { label: 'Extra', short: '5' },
  { label: 'Prenota', short: '6' },
  { label: 'Riepilogo', short: '7' }
];

export const StepIndicator = ({ currentStep, maxVisitedStep, onStepClick }) => {
  return (
    <div className="w-full py-4 px-2">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isClickable = index <= maxVisitedStep;

          return (
            <div key={index} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <motion.button
                onClick={() => isClickable && onStepClick(index)}
                disabled={!isClickable}
                className={`
                  relative flex items-center justify-center w-10 h-10 rounded-full 
                  text-sm font-bold transition-all duration-300
                  ${isCompleted 
                    ? 'bg-[#E0B840] text-[#0D0D1A]' 
                    : isActive 
                      ? 'bg-transparent border-2 border-[#E0B840] text-[#E0B840]' 
                      : 'bg-[#2A2A3E] text-[#555] border-2 border-[#2A2A3E]'
                  }
                  ${isClickable && !isActive ? 'cursor-pointer hover:scale-110' : ''}
                  ${!isClickable ? 'cursor-not-allowed opacity-50' : ''}
                `}
                whileHover={isClickable ? { scale: 1.1 } : {}}
                whileTap={isClickable ? { scale: 0.95 } : {}}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  step.short
                )}
                
                {/* Active pulse animation */}
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-[#E0B840]"
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </motion.button>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 relative">
                  <div className="absolute inset-0 bg-[#2A2A3E]" />
                  <motion.div
                    className="absolute inset-0 bg-[#E0B840] origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: isCompleted ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step label - mobile hidden, desktop visible */}
      <div className="hidden md:flex justify-between max-w-3xl mx-auto mt-2 px-1">
        {STEPS.map((step, index) => (
          <span 
            key={index}
            className={`text-xs font-medium text-center w-16
              ${index === currentStep ? 'text-[#E0B840]' : 'text-[#555]'}
            `}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default StepIndicator;
