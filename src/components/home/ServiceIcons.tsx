import {
  AirtimeIcon,
  BillsIcon,
  CableTvIcon,
  ConvertIcon,
  DataIcon,
  DepositIcon,
  EducationIcon,
  ElectricityIcon,
  FlightsIcon,
  MoreIcon,
  ReceiveIcon,
  SendIcon,
  WaterIcon,
  WithdrawIcon,
} from "@/components/layout/NavIcons";

/** One icon per catalogue key, so the circle grids never carry their own map. */
const ICONS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  airtime: AirtimeIcon,
  data: DataIcon,
  electricity: ElectricityIcon,
  cable_tv: CableTvIcon,
  water: WaterIcon,
  education: EducationIcon,
  deposit: DepositIcon,
  withdraw: WithdrawIcon,
  convert: ConvertIcon,
  pay_to_china: SendIcon,
  receive: ReceiveIcon,
  flights: FlightsIcon,
  more: MoreIcon,
};

export function ServiceIcon({ serviceKey, className = "size-5" }: { serviceKey: string; className?: string }) {
  const Icon = ICONS[serviceKey] ?? BillsIcon;
  return <Icon className={className} />;
}
