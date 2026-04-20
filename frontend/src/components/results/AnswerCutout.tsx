/**
 * AnswerCutout — renders a cropped, zoomed-in region of the student's scan
 * focused on a single answer's bbox. Reuses <ExamShapedScan> so the cropped
 * region is visually identical to the full scan shown on the left side of
 * the teacher workspace. Read-only (no click handlers, no question selection).
 */
import type { AnswerDetail } from '../../types'
import ExamShapedScan from './ExamShapedScan'
import { useLang } from '../../i18n'

interface Props {
  answer: AnswerDetail
  totalPages: number
  courseCode?: string
  courseName?: string
  examType?: string
  examDate?: string
  studentNumber?: string
}

export default function AnswerCutout({
  answer,
  totalPages,
  courseCode,
  courseName,
  examType,
  examDate,
  studentNumber,
}: Props) {
  const { lang } = useLang()
  const bbox = answer.bbox

  if (!bbox || bbox.w <= 0 || bbox.h <= 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden h-56 w-full flex items-center justify-center">
        <p className="text-xs text-slate-400">
          {lang === 'tr' ? 'Kırpılacak bölge yok' : 'No crop region'}
        </p>
      </div>
    )
  }

  // Blow the page up so the bbox region fills the container, and shift it
  // so (bbox.x, bbox.y) lands at the container's top-left.
  const scaledWidthPct = (100 / bbox.w)
  const scaledHeightPct = (100 / bbox.h)
  const leftPct = -(bbox.x / bbox.w) * 100
  const topPct = -(bbox.y / bbox.h) * 100

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden h-56 w-full">
      <div className="relative w-full h-full">
        <div
          className="absolute"
          style={{
            width: `${scaledWidthPct}%`,
            height: `${scaledHeightPct}%`,
            left: `${leftPct}%`,
            top: `${topPct}%`,
          }}
        >
          <ExamShapedScan
            answers={[answer]}
            activeQNum={answer.question_number}
            pageIndex={bbox.page ?? 1}
            totalPages={totalPages}
            courseCode={courseCode}
            courseName={courseName}
            examType={examType}
            examDate={examDate}
            studentNumber={studentNumber}
            thumbnail={false}
          />
        </div>
      </div>
    </div>
  )
}
