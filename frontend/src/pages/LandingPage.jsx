import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Wrench, 
  Calculator, 
  Users, 
  TrendingUp, 
  CheckCircle2,
  ArrowRight,
  Euro,
  Clock,
  BarChart3
} from "lucide-react";

export const LandingPage = () => {
  const features = [
    {
      icon: Calculator,
      title: "Calcolo Fiscale Automatico",
      description: "IRPEF, INPS, IVA calcolati automaticamente. Mai più sorprese dal commercialista."
    },
    {
      icon: BarChart3,
      title: "Profittabilità per Lavoro",
      description: "Scopri quali lavori ti fanno guadagnare di più e quali ti fanno perdere tempo."
    },
    {
      icon: Users,
      title: "Onboarding Clienti",
      description: "Checklist pre-lavoro automatiche. Il cliente compila, tu lavori tranquillo."
    },
    {
      icon: TrendingUp,
      title: "ROI Marketing",
      description: "Traccia da dove arrivano i clienti migliori. Investi dove funziona."
    }
  ];

  const benefits = [
    "Risparmia €200-500/mese in costi nascosti",
    "Calcola le tasse in 2 minuti",
    "Scopri i lavori più profittevoli",
    "Onboarding clienti professionale",
    "100% in italiano"
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-border z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary" style={{ fontFamily: 'Barlow, sans-serif' }}>
            BESIDE
          </h1>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" data-testid="login-link">Accedi</Button>
            </Link>
            <Link to="/register">
              <Button data-testid="register-link">Inizia Gratis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                <Wrench className="w-4 h-4" />
                Per Installatori PPF & Wrap
              </div>
              
              <h1 className="text-heading-1 text-4xl md:text-5xl lg:text-6xl text-primary leading-tight">
                GESTISCI IL TUO BUSINESS,<br />
                <span className="text-secondary">NON SOLO I LAVORI</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg">
                Sei un ottimo tecnico ma la gestione ti stressa? BESIDE è il dashboard che ti aiuta 
                a capire quanto guadagni davvero, pianificare le tasse e gestire i clienti. 
                Tutto in italiano, pensato per te.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/register">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="hero-cta-btn">
                    Prova Gratis 7 Giorni
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    Ho già un account
                  </Button>
                </Link>
              </div>
              
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Nessuna carta richiesta
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Setup in 5 minuti
                </span>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-xl border border-border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-primary">Dashboard</h3>
                  <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full">Live</span>
                </div>
                
                {/* Mock KPI Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Accantonamento Fiscale</p>
                    <p className="text-xl font-bold text-primary">€ 3.420</p>
                  </div>
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Cash Flow</p>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-success"></div>
                      <span className="text-sm font-medium">Positivo</span>
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Lavoro Più Profittevole</p>
                    <p className="text-sm font-medium">PPF Full</p>
                  </div>
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Top Lead Source</p>
                    <p className="text-sm font-medium">Passaparola</p>
                  </div>
                </div>
                
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-warning flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Prossima scadenza: Versamento INPS - 25 giorni
                  </p>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -z-10 top-8 -right-4 w-72 h-72 bg-secondary/20 rounded-full blur-3xl"></div>
              <div className="absolute -z-10 -bottom-4 -left-4 w-48 h-48 bg-primary/10 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-heading-2 text-primary mb-4">
              Tutto quello che ti serve, niente di più
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Strumenti semplici ma potenti, pensati per chi lavora con le mani 
              e non ha tempo da perdere con software complicati.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="card-metric stagger-item"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-primary mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-heading-2 text-primary mb-6">
                Perché BESIDE?
              </h2>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3 stagger-item">
                    <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    </div>
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-primary rounded-2xl p-8 text-white">
              <Euro className="w-12 h-12 mb-4 opacity-80" />
              <h3 className="text-2xl font-bold mb-2">Da €97/mese</h3>
              <p className="text-white/80 mb-6">
                Il costo di un paio di ore di lavoro. Il risparmio? 
                Decine di ore ogni mese e centinaia di euro in costi nascosti.
              </p>
              <Link to="/register">
                <Button 
                  variant="secondary" 
                  className="bg-white text-primary hover:bg-white/90"
                  data-testid="pricing-cta-btn"
                >
                  Inizia la Prova Gratuita
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: 'Barlow, sans-serif' }}>
            Pronto a gestire il tuo business come un pro?
          </h2>
          <p className="text-white/80 mb-8 max-w-2xl mx-auto">
            Unisciti a centinaia di installatori italiani che hanno già scoperto 
            quanto guadagnano davvero.
          </p>
          <Link to="/register">
            <Button 
              size="lg" 
              className="bg-white text-primary hover:bg-white/90"
              data-testid="footer-cta-btn"
            >
              Inizia Gratis Ora
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-background border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 BESIDE. Tutti i diritti riservati.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Termini di Servizio</a>
            <a href="#" className="hover:text-primary transition-colors">Contatti</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
