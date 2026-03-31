import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { MOCK_AVAILABILITY } from '../data/mockAvailability';

export const Step5_Booking = ({ 
  selectedDate, 
  selectedTime, 
  onSelectDate, 
  onSelectTime 
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 3, 1)); // Aprile 2026
  const [availability, setAvailability] = useState(MOCK_AVAILABILITY);

  // Genera giorni del mese
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay() || 7; // Lunedì = 1

    const days = [];
    
    // Giorni vuoti prima del primo giorno
    for (let i = 1; i < startingDay; i++) {
      days.push(null);
    }
    
    // Giorni del mese
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        date: dateStr,
        available: availability.available_dates.includes(dateStr)
      });
    }
    
    return days;
  };

  const days = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  // Slots per il giorno selezionato
  const timeSlots = selectedDate ? (availability.slots[selectedDate] || []) : [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Prenota Appuntamento
        </h2>
        <p className="text-[#AAA] text-sm">
          Scegli data e orario per l'installazione
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Calendar */}
        <div className="bg-[#1A1A2E] rounded-xl p-4 border border-[#2A2A3E]">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <motion.button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="p-2 rounded-lg hover:bg-[#2A2A3E] text-[#AAA]"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            
            <span className="text-white font-semibold capitalize">{monthName}</span>
            
            <motion.button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="p-2 rounded-lg hover:bg-[#2A2A3E] text-[#AAA]"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Week days header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs text-[#555] font-medium py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((dayData, index) => {
              if (!dayData) {
                return <div key={`empty-${index}`} className="p-2" />;
              }

              const isSelected = selectedDate === dayData.date;
              const isAvailable = dayData.available;

              return (
                <motion.button
                  key={dayData.date}
                  onClick={() => isAvailable && onSelectDate(dayData.date)}
                  disabled={!isAvailable}
                  className={`
                    p-2 rounded-lg text-sm font-medium transition-all
                    ${isSelected 
                      ? 'bg-[#E0B840] text-[#0D0D1A]' 
                      : isAvailable 
                        ? 'bg-[#13131F] text-white hover:bg-[#E0B840]/20' 
                        : 'bg-transparent text-[#333] cursor-not-allowed'
                    }
                  `}
                  whileHover={isAvailable ? { scale: 1.1 } : {}}
                  whileTap={isAvailable ? { scale: 0.95 } : {}}
                >
                  {dayData.day}
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-[#555]">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[#13131F]" />
              <span>Disponibile</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[#E0B840]" />
              <span>Selezionato</span>
            </div>
          </div>
        </div>

        {/* Time slots */}
        <div className="bg-[#1A1A2E] rounded-xl p-4 border border-[#2A2A3E]">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#E0B840]" />
            <span className="text-white font-semibold">Orari disponibili</span>
          </div>

          {!selectedDate ? (
            <div className="text-center py-8 text-[#555]">
              Seleziona una data dal calendario
            </div>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-8 text-[#555]">
              Nessun orario disponibile per questa data
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {timeSlots.map((time) => {
                const isSelected = selectedTime === time;
                
                return (
                  <motion.button
                    key={time}
                    onClick={() => onSelectTime(time)}
                    className={`
                      p-3 rounded-lg text-sm font-semibold transition-all
                      ${isSelected 
                        ? 'bg-[#E0B840] text-[#0D0D1A]' 
                        : 'bg-[#13131F] text-[#AAA] hover:bg-[#E0B840]/20 hover:text-white'
                      }
                    `}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {time}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Selected summary */}
          {selectedDate && selectedTime && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-lg bg-[#E0B840]/10 border border-[#E0B840]/30"
            >
              <div className="flex items-center gap-2 text-[#E0B840]">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {new Date(selectedDate).toLocaleDateString('it-IT', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })} alle {selectedTime}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default Step5_Booking;
