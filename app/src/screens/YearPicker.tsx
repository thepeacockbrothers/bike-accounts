import { taxYearLabel } from '../lib/taxYear'

interface Props {
  year: number
  years: number[]
  setYear: (y: number) => void
}

export default function YearPicker({ year, years, setYear }: Props) {
  return (
    <label className="year">
      Tax year
      <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {taxYearLabel(y)}
          </option>
        ))}
      </select>
    </label>
  )
}
