import Svg, { Path, SvgProps } from "react-native-svg";

export default function ChevronDownIcon(props: SvgProps) {
  return (
    <Svg fill="none" viewBox="0 0 12 8" {...props}>
      <Path
        d="M1.5 1.5 6 6l4.5-4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}
