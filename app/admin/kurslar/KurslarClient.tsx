'use client';

import { useState, useTransition } from 'react';
import { Button, Chip } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { CreatedCourseWithTopics, LessonCourseRow } from '@/lib/lessons/courses';
import { listCoursesAction, updateCourseAction, deleteCourseAction } from './actions';
import CourseCreateForm from './CourseCreateForm';
import CourseGroupsCreator from './CourseGroupsCreator';
import CourseTopicsPanel from './CourseTopicsPanel';

interface KurslarClientProps {
  initialCourses: LessonCourseRow[];
}

// Master/detail: course list on the left, the selected course's topic pipeline
// on the right. The whole surface is client-side because the topic generation
// loop is a long-lived client-driven sequence (see CourseTopicsPanel) — the
// course list has to stay mounted across it rather than being re-rendered by a
// server navigation mid-run.
export default function KurslarClient({ initialCourses }: KurslarClientProps) {
  const [courses, setCourses] = useState(initialCourses);
  const [selectedId, setSelectedId] = useState<string | null>(initialCourses[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(initialCourses.length === 0);
  const [showGroups, setShowGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const selected = courses.find((c) => c.id === selectedId) ?? null;

  function refreshCourses() {
    startRefresh(async () => {
      const result = await listCoursesAction();
      if (result.ok) setCourses(result.data);
      else setError(result.error);
    });
  }

  function handleCreated(course: LessonCourseRow) {
    setCourses((prev) => [...prev, course].sort((a, b) => a.orderIndex - b.orderIndex));
    setSelectedId(course.id);
    setShowCreate(false);
  }

  // The batch create can partially succeed, so the list is re-read from the
  // server rather than patched from what came back — `created` is the source of
  // truth for which course to select, not for what the list now contains.
  function handleGroupsCreated(created: CreatedCourseWithTopics[]) {
    if (created.length > 0) setSelectedId(created[0].course.id);
    refreshCourses();
  }

  async function handlePublishCourse(course: LessonCourseRow) {
    setError(null);
    // The backend refuses to publish a course with no published topic, so this
    // only ever succeeds after the per-topic publish step in CourseTopicsPanel.
    try {
      const result = await updateCourseAction(course.id, { status: 'published' });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refreshCourses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  async function handleDeleteCourse(course: LessonCourseRow) {
    if (!window.confirm(`"${course.title}" kursu və bütün mövzuları silinsin?`)) return;
    setError(null);
    try {
      const result = await deleteCourseAction(course.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      if (selectedId === course.id) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  return (
    <div className="pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">Təhsil</span>
          <h1 className="text-[28px] font-semibold leading-tight text-navy">Kurslar</h1>
        </div>
        <div className="flex items-center gap-2">
          {isRefreshing && <Spinner size="sm" tone="current" />}
          {/* Two entry points, mutually exclusive: one document → one course,
              or one document → 6-8 separately priced courses. */}
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            onPress={() => {
              setShowGroups((v) => !v);
              setShowCreate(false);
            }}
          >
            {showGroups ? 'Bağla' : 'Sənəddən kurslar yarat'}
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            className="rounded-full"
            onPress={() => {
              setShowCreate((v) => !v);
              setShowGroups(false);
            }}
          >
            {showCreate ? 'Bağla' : 'Yeni tək kurs'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {showGroups && (
        <div className="mb-6">
          <CourseGroupsCreator
            onCoursesCreated={handleGroupsCreated}
            onClose={() => setShowGroups(false)}
          />
        </div>
      )}

      {showCreate && (
        <div className="mb-6">
          <CourseCreateForm nextOrderIndex={courses.length} onCreated={handleCreated} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-3">
          <div className="text-legal-citation text-on-surface-variant">
            Kurs siyahısı ({courses.length})
          </div>

          {courses.length === 0 ? (
            <div className="glass-panel rounded-2xl px-4 py-8 text-center text-sm text-on-surface-variant">
              Hələ kurs yaradılmayıb. Yuxarıdakı «Sənəddən kurslar yarat» düyməsi ilə ingest
              edilmiş sənədi bir neçə kursa bölün.
            </div>
          ) : (
            courses.map((course) => {
              const isSelected = course.id === selectedId;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedId(course.id)}
                  className={`glass-card w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-transparent hover:border-outline-variant/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-on-surface">{course.title}</span>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={course.status === 'published' ? 'success' : 'default'}
                      className="shrink-0 text-[11px] font-medium tracking-normal"
                    >
                      {course.status === 'published' ? 'dərc edilib' : 'layihə'}
                    </Chip>
                  </div>
                  <p className="mt-1 text-label-sm text-on-surface-variant">
                    {course.documentTitle ?? 'Sənəd tapılmadı'}
                  </p>
                  <p className="mt-1 text-label-sm text-on-surface-variant">
                    {course.publishedTopicCount}/{course.topicCount} mövzu dərc edilib
                    {course.isFree ? ' · pulsuz' : ''}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div>
          {selected ? (
            <CourseTopicsPanel
              key={selected.id}
              course={selected}
              // Move targets: resolved here because the full course list only
              // exists at this level. The panel filters it down to the same
              // document, which is the only move the backend accepts.
              allCourses={courses}
              onPublishCourse={() => void handlePublishCourse(selected)}
              onDeleteCourse={() => void handleDeleteCourse(selected)}
              onTopicsChanged={refreshCourses}
            />
          ) : (
            <div className="glass-panel rounded-2xl px-4 py-12 text-center text-sm text-on-surface-variant">
              Mövzuları idarə etmək üçün soldan bir kurs seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
