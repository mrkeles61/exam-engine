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

  // The scan page renders at aspect ratio 1 / 1.414 (A4).
  // The bbox occupies bbox.w of page width by bbox.h of page height.
  // So in PIXELS the bbox aspect ratio is bbox.w / (bbox.h * 1.414).
  // By pinning the container to the *same* aspect ratio, the bbox region
  // fills the container exactly — no letterboxing, no offset drift.
  const containerAspect = bbox.w / (bbox.h * 1.414)
  const scaledWidthPct = 100 / bbox.w
  const leftPct = -(bbox.x / bbox.w) * 100
  const topPct = -(bbox.y / bbox.h) * 100

  return (
    <div
      className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden w-full"
      style={{ aspectRatio: `${containerAspect} / 1`, maxHeight: '16rem' }}
    >
      <div className="relative w-full h-full">
        {/* Inner wrapper uses A4 aspect so its height tracks scan's actual
            rendered height. Width is scaled so bbox.w fills container width.
            left/top percentages align the bbox region with the container. */}
        <div
          className="absolute"
          style={{
            width: `${scaledWidthPct}%`,
            aspectRatio: '1 / 1.414',
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
