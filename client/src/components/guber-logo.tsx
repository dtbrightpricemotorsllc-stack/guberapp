import logoImg from "@assets/Picsart_25-10-20_07-54-34-468_1772465286475.png";

export function GuberLogo({ size = "md", variant = "text" }: { size?: "sm" | "md" | "lg" | "xl"; variant?: "text" | "full" | "splash" }) {
  const imgSizes = {
    sm: "h-7",
    md: "h-10",
    lg: "h-16",
    xl: "h-24",
  };

  // Right transparent padding = 9.5% of rendered width, so pull ™ in by that amount
  // Rendered widths: sm=125.5px md=179.3px lg=287px xl=430px
  const tmSizes = {
    sm:  { fontSize: 7,  top: -3,  marginLeft: -11 },
    md:  { fontSize: 9,  top: -4,  marginLeft: -16 },
    lg:  { fontSize: 12, top: -6,  marginLeft: -26 },
    xl:  { fontSize: 16, top: -8,  marginLeft: -40 },
  };

  const tm = tmSizes[size];

  return (
    <div className="inline-flex items-start" data-testid="guber-logo">
      <img
        src={logoImg}
        alt="GUBER"
        className={`${imgSizes[size]} w-auto object-contain`}
        style={{ imageRendering: "crisp-edges" }}
      />
      <span
        className="relative font-semibold text-white/70 leading-none"
        style={{ fontSize: tm.fontSize, top: tm.top, marginLeft: tm.marginLeft }}
      >™</span>
    </div>
  );
}
