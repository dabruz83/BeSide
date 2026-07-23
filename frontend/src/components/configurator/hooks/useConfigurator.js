import { useReducer, useCallback, useMemo } from 'react';
import { calculatePrice } from '../utils/priceCalculator';

// Stato iniziale del configuratore
const initialState = {
  step: 0,
  maxVisitedStep: 0,
  vehicle: null,
  baseColor: null,
  film: null,
  filmColor: null,
  zones: [],
  tinting: {
    vetri: null,
    fari: null
  },
  booking: {
    date: null,
    time: null
  },
  customerEmail: '',
  gdprConsent: false
};

// Action types
const ACTIONS = {
  SET_VEHICLE: 'SET_VEHICLE',
  SET_BASE_COLOR: 'SET_BASE_COLOR',
  SET_FILM: 'SET_FILM',
  SET_FILM_COLOR: 'SET_FILM_COLOR',
  TOGGLE_ZONE: 'TOGGLE_ZONE',
  SET_TINTING_VETRI: 'SET_TINTING_VETRI',
  SET_TINTING_FARI: 'SET_TINTING_FARI',
  SET_BOOKING_DATE: 'SET_BOOKING_DATE',
  SET_BOOKING_TIME: 'SET_BOOKING_TIME',
  SET_CUSTOMER_EMAIL: 'SET_CUSTOMER_EMAIL',
  SET_GDPR_CONSENT: 'SET_GDPR_CONSENT',
  NEXT_STEP: 'NEXT_STEP',
  PREV_STEP: 'PREV_STEP',
  GO_TO_STEP: 'GO_TO_STEP',
  RESET: 'RESET'
};

// Reducer
function configuratorReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_VEHICLE:
      return { ...state, vehicle: action.payload };
    
    case ACTIONS.SET_BASE_COLOR:
      return { ...state, baseColor: action.payload };
    
    case ACTIONS.SET_FILM:
      // Reset film color when changing film type
      return { ...state, film: action.payload, filmColor: null };
    
    case ACTIONS.SET_FILM_COLOR:
      return { ...state, filmColor: action.payload };
    
    case ACTIONS.TOGGLE_ZONE:
      const zoneId = action.payload;
      const isSelected = state.zones.includes(zoneId);
      return {
        ...state,
        zones: isSelected
          ? state.zones.filter(z => z !== zoneId)
          : [...state.zones, zoneId]
      };
    
    case ACTIONS.SET_TINTING_VETRI:
      return { ...state, tinting: { ...state.tinting, vetri: action.payload } };
    
    case ACTIONS.SET_TINTING_FARI:
      return { ...state, tinting: { ...state.tinting, fari: action.payload } };
    
    case ACTIONS.SET_BOOKING_DATE:
      return { ...state, booking: { ...state.booking, date: action.payload, time: null } };
    
    case ACTIONS.SET_BOOKING_TIME:
      return { ...state, booking: { ...state.booking, time: action.payload } };
    
    case ACTIONS.SET_CUSTOMER_EMAIL:
      return { ...state, customerEmail: action.payload };
    
    case ACTIONS.SET_GDPR_CONSENT:
      return { ...state, gdprConsent: action.payload };
    
    case ACTIONS.NEXT_STEP:
      const nextStep = Math.min(state.step + 1, 6);
      return {
        ...state,
        step: nextStep,
        maxVisitedStep: Math.max(state.maxVisitedStep, nextStep)
      };
    
    case ACTIONS.PREV_STEP:
      return { ...state, step: Math.max(state.step - 1, 0) };
    
    case ACTIONS.GO_TO_STEP:
      // Can only go to visited steps
      if (action.payload <= state.maxVisitedStep) {
        return { ...state, step: action.payload };
      }
      return state;
    
    case ACTIONS.RESET:
      return initialState;
    
    default:
      return state;
  }
}

// Hook principale
export function useConfigurator() {
  const [state, dispatch] = useReducer(configuratorReducer, initialState);

  // Actions
  const setVehicle = useCallback((vehicleId) => {
    dispatch({ type: ACTIONS.SET_VEHICLE, payload: vehicleId });
  }, []);

  const setBaseColor = useCallback((color) => {
    dispatch({ type: ACTIONS.SET_BASE_COLOR, payload: color });
  }, []);

  const setFilm = useCallback((filmId) => {
    dispatch({ type: ACTIONS.SET_FILM, payload: filmId });
  }, []);

  const setFilmColor = useCallback((color) => {
    dispatch({ type: ACTIONS.SET_FILM_COLOR, payload: color });
  }, []);

  const toggleZone = useCallback((zoneId) => {
    dispatch({ type: ACTIONS.TOGGLE_ZONE, payload: zoneId });
  }, []);

  const setTintingVetri = useCallback((option) => {
    dispatch({ type: ACTIONS.SET_TINTING_VETRI, payload: option });
  }, []);

  const setTintingFari = useCallback((option) => {
    dispatch({ type: ACTIONS.SET_TINTING_FARI, payload: option });
  }, []);

  const setBookingDate = useCallback((date) => {
    dispatch({ type: ACTIONS.SET_BOOKING_DATE, payload: date });
  }, []);

  const setBookingTime = useCallback((time) => {
    dispatch({ type: ACTIONS.SET_BOOKING_TIME, payload: time });
  }, []);

  const setCustomerEmail = useCallback((email) => {
    dispatch({ type: ACTIONS.SET_CUSTOMER_EMAIL, payload: email });
  }, []);

  const setGdprConsent = useCallback((consent) => {
    dispatch({ type: ACTIONS.SET_GDPR_CONSENT, payload: consent });
  }, []);

  const nextStep = useCallback(() => {
    dispatch({ type: ACTIONS.NEXT_STEP });
  }, []);

  const prevStep = useCallback(() => {
    dispatch({ type: ACTIONS.PREV_STEP });
  }, []);

  const goToStep = useCallback((step) => {
    dispatch({ type: ACTIONS.GO_TO_STEP, payload: step });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: ACTIONS.RESET });
  }, []);

  // Computed price
  const price = useMemo(() => {
    return calculatePrice({
      vehicle: state.vehicle,
      film: state.film,
      zones: state.zones,
      tinting: state.tinting
    });
  }, [state.vehicle, state.film, state.zones, state.tinting]);

  // Can proceed validation per step
  const canProceed = useMemo(() => ({
    0: state.vehicle !== null,
    1: state.baseColor !== null,
    2: state.film !== null && state.filmColor !== null,
    3: state.zones.length > 0,
    4: true, // Step opzionale
    5: state.booking.date !== null && state.booking.time !== null,
    6: state.gdprConsent
  }), [state]);

  return {
    state,
    price,
    canProceed,
    actions: {
      setVehicle,
      setBaseColor,
      setFilm,
      setFilmColor,
      toggleZone,
      setTintingVetri,
      setTintingFari,
      setBookingDate,
      setBookingTime,
      setCustomerEmail,
      setGdprConsent,
      nextStep,
      prevStep,
      goToStep,
      reset
    }
  };
}
