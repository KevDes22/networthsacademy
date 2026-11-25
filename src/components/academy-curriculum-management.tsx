import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Link2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import {
  createCourseLesson,
  createCourseSection,
  deleteCourseLesson,
  deleteCourseSection,
  getCourseCurriculum,
  moveCourseContent,
  updateCourseLesson,
  updateCourseSection,
} from '@/lib/academy-curriculum.functions';
import {
  curriculumFileAccept,
  isLessonType,
  lessonPublishError,
  lessonTypes,
  type LessonType,
  validateCurriculumFile,
} from '@/lib/academy-curriculum';

type Curriculum = Awaited<ReturnType<typeof getCourseCurriculum>>;
type CurriculumSection = Curriculum['sections'][number];
type CurriculumLesson = CurriculumSection['lessons'][number];
type LessonStatus = 'draft' | 'in_review' | 'published';

type SectionFormState = { title: string; description: string };
type LessonFormState = {
  title: string;
  summary: string;
  lesson_type: LessonType;
  article_content: string;
  video_url: string;
  file: File | null;
  removeFile: boolean;
};

const emptySectionForm = (): SectionFormState => ({ title: '', description: '' });
const emptyLessonForm = (): LessonFormState => ({
  title: '',
  summary: '',
  lesson_type: 'article',
  article_content: '',
  video_url: '',
  file: null,
  removeFile: false,
});

export function CourseCurriculumManagement({
  courseId,
  userId,
  isAdmin,
}: {
  courseId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['course-curriculum', courseId];
  const { data } = useSuspenseQuery({ queryKey, queryFn: () => getCourseCurriculum({ data: { course_id: courseId } }) });
  const addSection = useServerFn(createCourseSection);
  const saveSection = useServerFn(updateCourseSection);
  const removeSection = useServerFn(deleteCourseSection);
  const addLesson = useServerFn(createCourseLesson);
  const saveLesson = useServerFn(updateCourseLesson);
  const removeLesson = useServerFn(deleteCourseLesson);
  const moveItem = useServerFn(moveCourseContent);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<CurriculumSection | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(emptySectionForm);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<CurriculumSection | null>(null);
  const [editingLesson, setEditingLesson] = useState<CurriculumLesson | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonFormState>(emptyLessonForm);
  const [saving, setSaving] = useState(false);
  const backTo = isAdmin ? '/admin/courses' : '/instructor/courses';

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  function openSection(section?: CurriculumSection) {
    setEditingSection(section ?? null);
    setSectionForm(section ? { title: section.title, description: section.description } : emptySectionForm());
    setSectionOpen(true);
  }

  async function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingSection) {
        await saveSection({ data: { id: editingSection.id, ...sectionForm } });
        toast.success('Section saved.');
      } else {
        await addSection({ data: { course_id: courseId, ...sectionForm } });
        toast.success('Section added.');
      }
      setSectionOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save this section.');
    } finally {
      setSaving(false);
    }
  }

  function openLesson(section: CurriculumSection, lesson?: CurriculumLesson) {
    setActiveSection(section);
    setEditingLesson(lesson ?? null);
    setLessonForm(lesson && isLessonType(lesson.lesson_type) ? {
      title: lesson.title,
      summary: lesson.summary,
      lesson_type: lesson.lesson_type,
      article_content: lesson.article_content,
      video_url: lesson.video_url ?? '',
      file: null,
      removeFile: false,
    } : emptyLessonForm());
    setLessonOpen(true);
  }

  async function uploadFile(file: File, lessonId: string) {
    const path = `${userId}/${courseId}/${lessonId}/${crypto.randomUUID()}`;
    const result = await supabase.storage.from('academy-course-materials').upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (result.error) throw new Error('The file could not be uploaded. Check the file type and size, then try again.');
    return path;
  }

  async function submitLesson(event: FormEvent<HTMLFormElement>, status: LessonStatus) {
    event.preventDefault();
    if (!activeSection) return;
    if (lessonForm.file) {
      const fileError = validateCurriculumFile(lessonForm.file, lessonForm.lesson_type);
      if (fileError) {
        toast.error(fileError);
        return;
      }
    }

    const oldFilePath = editingLesson?.file_path ?? null;
    const filePathForCheck = lessonForm.file
      ? 'pending-upload'
      : lessonForm.removeFile ? null : oldFilePath;
    const mimeTypeForCheck = lessonForm.file
      ? lessonForm.file.type
      : lessonForm.removeFile ? null : editingLesson?.file_mime_type ?? null;
    if (status !== 'draft') {
      const contentError = lessonPublishError({
        lessonType: lessonForm.lesson_type,
        articleContent: lessonForm.article_content,
        videoUrl: lessonForm.video_url.trim() || null,
        filePath: filePathForCheck,
        fileMimeType: mimeTypeForCheck,
      });
      if (contentError) {
        toast.error(contentError);
        return;
      }
    }

    setSaving(true);
    let uploadedPath: string | null = null;
    let lessonId = editingLesson?.id ?? null;
    try {
      if (!lessonId) {
        const created = await addLesson({ data: {
          course_id: courseId,
          section_id: activeSection.id,
          title: lessonForm.title,
          summary: lessonForm.summary,
          lesson_type: lessonForm.lesson_type,
        } });
        lessonId = created.id;
        setEditingLesson(created as CurriculumLesson);
      }

      if (!lessonId) throw new Error('Unable to prepare this lesson.');
      if (lessonForm.file) uploadedPath = await uploadFile(lessonForm.file, lessonId);

      const filePath = uploadedPath ?? (lessonForm.removeFile ? null : oldFilePath);
      const fileName = uploadedPath && lessonForm.file ? lessonForm.file.name : lessonForm.removeFile ? null : editingLesson?.file_name ?? null;
      const fileMimeType = uploadedPath && lessonForm.file ? lessonForm.file.type : lessonForm.removeFile ? null : editingLesson?.file_mime_type ?? null;
      const fileSizeBytes = uploadedPath && lessonForm.file ? lessonForm.file.size : lessonForm.removeFile ? null : editingLesson?.file_size_bytes ?? null;
      const basePayload = {
        id: lessonId,
        title: lessonForm.title,
        summary: lessonForm.summary,
        lesson_type: lessonForm.lesson_type,
        article_content: lessonForm.article_content,
        video_url: lessonForm.video_url.trim() || null,
        file_path: filePath,
        file_name: fileName,
        file_mime_type: fileMimeType,
        file_size_bytes: fileSizeBytes,
      };

      const saved = await saveLesson({ data: { ...basePayload, status: 'draft' } });
      if (oldFilePath && oldFilePath !== filePath) {
        const removed = await supabase.storage.from('academy-course-materials').remove([oldFilePath]);
        if (removed.error) toast.error('Lesson saved, but its previous file could not be removed.');
      }
      if (status !== 'draft') await saveLesson({ data: { ...basePayload, status } });

      setLessonOpen(false);
      setEditingLesson(null);
      toast.success(status === 'published' ? 'Lesson published.' : status === 'in_review' ? 'Lesson sent for review.' : 'Lesson saved as a draft.');
      await refresh();
      return saved;
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('academy-course-materials').remove([uploadedPath]);
      toast.error(error instanceof Error ? error.message : 'Unable to save this lesson.');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(lesson: CurriculumLesson, status: LessonStatus) {
    if (!isLessonType(lesson.lesson_type)) return;
    setSaving(true);
    try {
      await saveLesson({ data: {
        id: lesson.id,
        title: lesson.title,
        summary: lesson.summary,
        lesson_type: lesson.lesson_type,
        article_content: lesson.article_content,
        video_url: lesson.video_url,
        file_path: lesson.file_path,
        file_name: lesson.file_name,
        file_mime_type: lesson.file_mime_type,
        file_size_bytes: lesson.file_size_bytes,
        status,
      } });
      toast.success(status === 'published' ? 'Lesson published.' : status === 'in_review' ? 'Lesson sent for review.' : 'Lesson moved to drafts.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update this lesson.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLesson(lesson: CurriculumLesson) {
    if (!window.confirm(`Remove “${lesson.title}” from this course?`)) return;
    setSaving(true);
    try {
      if (lesson.file_path) {
        const fileResult = await supabase.storage.from('academy-course-materials').remove([lesson.file_path]);
        if (fileResult.error) throw new Error('The lesson file could not be removed.');
      }
      await removeLesson({ data: { id: lesson.id } });
      toast.success('Lesson removed.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove this lesson.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSection(section: CurriculumSection) {
    if (section.lessons.length > 0) return;
    if (!window.confirm(`Remove the empty section “${section.title}”?`)) return;
    try {
      await removeSection({ data: { id: section.id } });
      toast.success('Section removed.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove this section.');
    }
  }

  async function move(kind: 'section' | 'lesson', id: string, direction: 'up' | 'down') {
    try {
      await moveItem({ data: { kind, id, direction } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reorder course content.');
    }
  }

  async function openMaterial(lesson: CurriculumLesson) {
    if (!lesson.file_path) return;
    const result = await supabase.storage.from('academy-course-materials').createSignedUrl(lesson.file_path, 60);
    if (result.error || !result.data.signedUrl) {
      toast.error('This private file could not be opened.');
      return;
    }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const visibleLessons = data.sections.reduce((total, section) => total + section.lessons.length, 0);
  const awaitingReview = data.sections.reduce((total, section) => total + section.lessons.filter((lesson) => lesson.status === 'in_review').length, 0);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-7">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-5 -ml-3"><Link to={backTo}><ArrowLeft size={16} /> Back to courses</Link></Button>
          <p className="eyebrow text-primary mb-3">Course curriculum</p>
          <h1 className="section-title">{data.course.title}</h1>
          <p className="text-sm text-muted-foreground mt-3">Build ordered sections and lessons for this course.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={data.course.status === 'published' ? 'default' : 'outline'}>{data.course.status === 'published' ? 'Course published' : 'Course draft'}</Badge>
          <Button onClick={() => openSection()}><Plus size={17} /> Add section</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border py-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><BookOpen size={16} /> {data.sections.length} sections</span>
        <span className="inline-flex items-center gap-2"><FileText size={16} /> {visibleLessons} lessons</span>
        {isAdmin && <span className="inline-flex items-center gap-2"><Clock3 size={16} /> {awaitingReview} awaiting review</span>}
      </div>

      {data.sections.length === 0 ? (
        <div className="empty mt-5">
          <span className="category-icon mx-auto mb-6"><BookOpen size={25} /></span>
          <h2 className="font-display font-semibold text-lg">Start with your first section</h2>
          <p className="text-muted-foreground text-sm mt-3">Create a section to organize lessons, videos, and learning files.</p>
          <Button className="mt-6" onClick={() => openSection()}><Plus size={16} /> Add section</Button>
        </div>
      ) : (
        <div className="mt-2">
          {data.sections.map((section, index) => (
            <article className="border-b border-border py-7" key={section.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="category-icon shrink-0"><BookOpen size={18} /></span>
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold">{section.title}</h2>
                      {section.description && <p className="text-sm text-muted-foreground mt-1">{section.description}</p>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <IconAction label="Move section up" disabled={index === 0} onClick={() => void move('section', section.id, 'up')}><ArrowUp size={16} /></IconAction>
                  <IconAction label="Move section down" disabled={index === data.sections.length - 1} onClick={() => void move('section', section.id, 'down')}><ArrowDown size={16} /></IconAction>
                  <IconAction label="Edit section" onClick={() => openSection(section)}><Pencil size={16} /></IconAction>
                  <IconAction label="Delete empty section" disabled={section.lessons.length > 0} onClick={() => void deleteSection(section)}><Trash2 size={16} /></IconAction>
                </div>
              </div>

              <div className="mt-5 ml-0 md:ml-[56px]">
                {section.lessons.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {section.lessons.map((lesson, lessonIndex) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        index={lessonIndex}
                        lessons={section.lessons}
                        isAdmin={isAdmin}
                        saving={saving}
                        onEdit={() => openLesson(section, lesson)}
                        onMove={(direction) => void move('lesson', lesson.id, direction)}
                        onStatus={(status) => void changeStatus(lesson, status)}
                        onDelete={() => void deleteLesson(lesson)}
                        onOpenMaterial={() => void openMaterial(lesson)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="border-y border-border py-4 text-sm text-muted-foreground">No lessons in this section yet.</p>
                )}
                <Button variant="outline" size="sm" className="mt-4" onClick={() => openLesson(section)}><Plus size={15} /> Add lesson</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={sectionOpen} onOpenChange={setSectionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Edit section' : 'Add a section'}</DialogTitle>
            <DialogDescription>Sections keep this course organized into clear learning steps.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={(event) => void submitSection(event)}>
            <label className="block text-sm font-semibold">Section title
              <Input className="mt-2" required maxLength={160} value={sectionForm.title} onChange={(event) => setSectionForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="block text-sm font-semibold">Description <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea className="mt-2 min-h-24" maxLength={1000} value={sectionForm.description} onChange={(event) => setSectionForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSectionOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingSection ? 'Save section' : 'Add section'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={lessonOpen} onOpenChange={setLessonOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingLesson ? 'Edit lesson' : 'Add a lesson'}</DialogTitle>
            <DialogDescription>{activeSection?.title ?? 'Course section'} · {isAdmin ? 'Administrator review and publishing' : 'Save a draft or submit it for review'}</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={(event) => void submitLesson(event, 'draft')}>
            <label className="block text-sm font-semibold">Lesson title
              <Input className="mt-2" required minLength={1} maxLength={160} value={lessonForm.title} onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="block text-sm font-semibold">Short summary <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea className="mt-2 min-h-20" maxLength={1000} value={lessonForm.summary} onChange={(event) => setLessonForm((current) => ({ ...current, summary: event.target.value }))} />
            </label>
            <label className="block text-sm font-semibold">Material type
              <Select value={lessonForm.lesson_type} onValueChange={(value) => {
                if (!isLessonType(value)) return;
                setLessonForm((current) => ({ ...current, lesson_type: value }));
              }}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Written lesson</SelectItem>
                  <SelectItem value="video">Video lesson</SelectItem>
                  <SelectItem value="resource">Downloadable file</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {lessonForm.lesson_type === 'article' && <label className="block text-sm font-semibold">Lesson content
              <Textarea className="mt-2 min-h-48" maxLength={50000} placeholder="Write the lesson content here…" value={lessonForm.article_content} onChange={(event) => setLessonForm((current) => ({ ...current, article_content: event.target.value }))} />
            </label>}

            {lessonForm.lesson_type === 'video' && <>
              <label className="block text-sm font-semibold">Video link <span className="font-normal text-muted-foreground">(optional if uploading a video)</span>
                <Input className="mt-2" type="url" inputMode="url" placeholder="https://…" value={lessonForm.video_url} onChange={(event) => setLessonForm((current) => ({ ...current, video_url: event.target.value }))} />
              </label>
              <MaterialFileField
                label="Or upload a video"
                accept={curriculumFileAccept}
                existingName={editingLesson?.file_name ?? null}
                file={lessonForm.file}
                removeFile={lessonForm.removeFile}
                onFile={(file) => setLessonForm((current) => ({ ...current, file, removeFile: false }))}
                onRemove={() => setLessonForm((current) => ({ ...current, file: null, removeFile: true }))}
              />
            </>}

            {lessonForm.lesson_type === 'resource' && <MaterialFileField
              label="Learning material"
              accept={curriculumFileAccept}
              existingName={editingLesson?.file_name ?? null}
              file={lessonForm.file}
              removeFile={lessonForm.removeFile}
              onFile={(file) => setLessonForm((current) => ({ ...current, file, removeFile: false }))}
              onRemove={() => setLessonForm((current) => ({ ...current, file: null, removeFile: true }))}
            />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLessonOpen(false)}>Cancel</Button>
              <Button type="submit" variant="outline" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
              {isAdmin
                ? <Button type="button" disabled={saving} onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form?.reportValidity()) void submitLesson({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, 'published');
                  }}><CheckCircle2 size={16} /> Publish lesson</Button>
                : <Button type="button" disabled={saving} onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form?.reportValidity()) void submitLesson({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, 'in_review');
                  }}><Send size={16} /> Send for review</Button>}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LessonRow({
  lesson,
  index,
  lessons,
  isAdmin,
  saving,
  onEdit,
  onMove,
  onStatus,
  onDelete,
  onOpenMaterial,
}: {
  lesson: CurriculumLesson;
  index: number;
  lessons: CurriculumLesson[];
  isAdmin: boolean;
  saving: boolean;
  onEdit: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onStatus: (status: LessonStatus) => void;
  onDelete: () => void;
  onOpenMaterial: () => void;
}) {
  const icon = lesson.lesson_type === 'video' ? Video : lesson.lesson_type === 'resource' ? Download : FileText;
  const Icon = icon;
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const canEdit = isAdmin || lesson.status === 'draft';
  const canMoveUp = isAdmin || (!previous || previous.status === 'draft');
  const canMoveDown = isAdmin || (!next || next.status === 'draft');

  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <span className="category-icon h-9 w-9 shrink-0"><Icon size={17} /></span>
      <div className="min-w-[160px] flex-1">
        <p className="font-semibold">{lesson.title}</p>
        {lesson.summary && <p className="text-xs text-muted-foreground mt-1">{lesson.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LessonStatusBadge status={lesson.status} />
          {lesson.file_name && <span className="max-w-[220px] truncate text-xs text-muted-foreground">{lesson.file_name}</span>}
          {lesson.video_url && <a className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4" href={lesson.video_url} target="_blank" rel="noreferrer"><Link2 size={13} /> Video link</a>}
          {lesson.file_path && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onOpenMaterial}><Download size={13} /> Open file</Button>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <IconAction label="Move lesson up" disabled={index === 0 || !canMoveUp || saving} onClick={() => onMove('up')}><ArrowUp size={15} /></IconAction>
        <IconAction label="Move lesson down" disabled={index === lessons.length - 1 || !canMoveDown || saving} onClick={() => onMove('down')}><ArrowDown size={15} /></IconAction>
        {canEdit && <IconAction label="Edit lesson" disabled={saving} onClick={onEdit}><Pencil size={15} /></IconAction>}
        {!isAdmin && lesson.status === 'draft' && <Button size="sm" variant="outline" disabled={saving} onClick={() => onStatus('in_review')}><Send size={14} /> Submit</Button>}
        {isAdmin && lesson.status !== 'published' && <Button size="sm" disabled={saving} onClick={() => onStatus('published')}><CheckCircle2 size={14} /> Publish</Button>}
        {isAdmin && lesson.status === 'published' && <Button size="sm" variant="outline" disabled={saving} onClick={() => onStatus('draft')}>Unpublish</Button>}
        {isAdmin && lesson.status === 'in_review' && <Button size="sm" variant="outline" disabled={saving} onClick={() => onStatus('draft')}>Return to draft</Button>}
        {(isAdmin || lesson.status === 'draft') && <IconAction label="Delete lesson" disabled={saving} onClick={onDelete}><Trash2 size={15} /></IconAction>}
      </div>
    </div>
  );
}

function MaterialFileField({
  label,
  accept,
  existingName,
  file,
  removeFile,
  onFile,
  onRemove,
}: {
  label: string;
  accept: string;
  existingName: string | null;
  file: File | null;
  removeFile: boolean;
  onFile: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold">{label}
        <Input className="mt-2" type="file" accept={accept} onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)} />
      </label>
      <p className="text-xs text-muted-foreground mt-2">Videos, PDFs, presentations, documents, spreadsheets, images, audio, or text · up to 250 MB.</p>
      {file && <p className="mt-2 text-sm">Selected: {file.name}</p>}
      {!file && existingName && !removeFile && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="truncate">Current file: {existingName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}><Trash2 size={14} /> Remove file</Button>
        </div>
      )}
      {removeFile && <p className="mt-2 text-xs text-muted-foreground">The current file will be removed when you save.</p>}
    </div>
  );
}

function IconAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <Button type="button" variant="ghost" size="icon" title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>;
}

function LessonStatusBadge({ status }: { status: string }) {
  if (status === 'published') return <Badge><CheckCircle2 size={13} className="mr-1" /> Published</Badge>;
  if (status === 'in_review') return <Badge variant="secondary"><Clock3 size={13} className="mr-1" /> In review</Badge>;
  return <Badge variant="outline"><Pencil size={12} className="mr-1" /> Draft</Badge>;
}