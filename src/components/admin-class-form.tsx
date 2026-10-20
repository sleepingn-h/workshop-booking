"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Info, Paintbrush, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type ReactNode } from "react";
import { toast } from "sonner";

import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { Tag } from "@/components/status-badge";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { ALLOWED_IMAGE_TYPES, IMAGE_MAX_BYTES, validateClassInput, validateImage } from "@/lib/rules";
import { ERROR_MESSAGE, type AdminClassDetail, type FieldErrors } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-strong)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const primaryClassName = `${buttonClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`;
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const smallClassName = "h-auto min-h-9 gap-2 self-start rounded-[var(--radius-button-sm)] px-4 py-2 text-sm font-medium transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100 max-[641px]:min-h-11 [&_svg]:size-4";
const cardClassName = "flex min-w-0 flex-col rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";
const imageErrorMessage = `JPEG·PNG·WebP, ${IMAGE_MAX_BYTES / (1024 * 1024)}MB 이하 이미지를 선택해 주세요.`;
const deleteBlockedMessage = "회차가 있어 삭제할 수 없어요. 대신 비공개로 전환하세요.";
// 설명 하나에 필수 안내를 쓰므로(R-53) 고객 상세가 안내 항목으로 나누는 "라벨: 값" 줄 형식을 예시로 보여준다.
const descriptionPlaceholder = "클래스를 소개해 주세요.\n장소: 공방 이름과 방문 주소\n소요 시간: 2시간\n비용·결제 방법: 1인 45,000원, 현장 결제\n준비물: 없음\n문의처: 010-0000-0000";
type ClassFields = { title: string; description: string };
type Change =
  | { type: "save"; fields: ClassFields }
  | { type: "visibility"; isPublished: boolean }
  | { type: "image"; file: File }
  | { type: "delete" };

function ErrorNotice({ message }: { message: string }): JSX.Element {
  return (
    <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
      <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
      <p className="min-w-0 [overflow-wrap:anywhere]">{message}</p>
    </div>
  );
}

function ClassEditor({ classId, workshop, children }: { classId?: string; workshop?: AdminClassDetail; children?: ReactNode }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefix = useId();
  // 이미지·공개 상태 재조회로 저장 전 입력을 덮어쓰지 않는다.
  const [draft, setDraft] = useState<ClassFields | null>(null);
  const fields = draft ?? { title: workshop?.title ?? "", description: workshop?.description ?? "" };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof ClassFields>>({});
  const [failure, setFailure] = useState<{ type: Change["type"]; message: string } | null>(null);
  const [imageError, setImageError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const path = `/api/admin/classes/${encodeURIComponent(classId ?? "")}`;
  const hasSessions = Boolean(workshop?.sessions.length);
  const mutation = useMutation({
    mutationFn: async (change: Change): Promise<{ id: string } | undefined> => {
      if (change.type === "save") {
        if (!classId) return apiFetch<{ id: string }>("/api/admin/classes", { method: "POST", json: change.fields });
        await apiFetch(path, { method: "PATCH", json: change.fields });
      } else if (change.type === "visibility") {
        await apiFetch(path, { method: "PATCH", json: { isPublished: change.isPublished } });
      } else if (change.type === "image") {
        const form = new FormData();
        form.set("image", change.file);
        await apiFetch(`${path}/image`, { method: "PUT", body: form });
      } else {
        await apiFetch(path, { method: "DELETE" });
      }
    },
    onSuccess: async (result, change) => {
      setDialogOpen(false);
      if (change.type === "save") {
        toast.success(classId ? "저장했어요" : "비공개 클래스를 만들었어요");
        if (result) router.push(`/admin/classes/${encodeURIComponent(result.id)}`);
      } else if (change.type === "image") {
        toast.success("대표 이미지를 바꿨어요");
      } else if (change.type === "delete") {
        toast.success("클래스를 삭제했어요");
        router.push("/admin/classes");
      }
      // 공개 스위치는 재조회가 끝날 때까지 처리 중으로 두어 이전 상태로 잠깐 돌아가지 않게 한다.
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (change.type === "save") setDraft(null);
    },
    onError: (error, change) => {
      const message = error instanceof ApiError
        ? error.code === "CLASS_HAS_SESSIONS" ? deleteBlockedMessage : error.message
        : ERROR_MESSAGE.INTERNAL_ERROR;
      setFailure({ type: change.type, message });
      if (change.type === "save" && error instanceof ApiError && error.fields) setFieldErrors(error.fields);
      toast.error(message);
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  const isPublished = pending?.type === "visibility" ? pending.isPublished : workshop?.isPublished ?? false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    setFailure(null);
    const validated = validateClassInput(fields);
    if (!validated.ok) { setFieldErrors(validated.fieldErrors); return; }
    setFieldErrors({});
    mutation.mutate({ type: "save", fields: validated.value });
  }

  function upload(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (mutation.isPending || !file) return;
    setFailure(null);
    if (!validateImage(file).ok) { setImageError(imageErrorMessage); return; }
    setImageError("");
    mutation.mutate({ type: "image", file });
  }

  const form = (
    <form onSubmit={submit} noValidate aria-label="클래스 정보" aria-busy={pending?.type === "save"} className={`${cardClassName} gap-4 p-7 max-[641px]:p-5`}>
      <h2 className="font-heading text-xl leading-[1.3] font-bold">기본 정보</h2>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-title`} className="text-sm font-semibold text-[var(--text-strong)]">클래스명</Label>
        <Input id={`${prefix}-title`} name="title" value={fields.title} onChange={(event) => { setDraft({ ...fields, title: event.target.value }); setFieldErrors((errors) => ({ ...errors, title: undefined })); }} disabled={pending?.type === "save"} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? `${prefix}-title-error` : undefined} className={inputClassName} />
        {fieldErrors.title && <p id={`${prefix}-title-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.title}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-description`} className="text-sm font-semibold text-[var(--text-strong)]">소개</Label>
        <Textarea id={`${prefix}-description`} name="description" value={fields.description} placeholder={descriptionPlaceholder} onChange={(event) => { setDraft({ ...fields, description: event.target.value }); setFieldErrors((errors) => ({ ...errors, description: undefined })); }} disabled={pending?.type === "save"} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? `${prefix}-description-error` : undefined} className={`${inputClassName} min-h-[200px] resize-y px-4 py-3.5 leading-[1.5]`} />
        {fieldErrors.description && <p id={`${prefix}-description-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.description}</p>}
      </div>
      {failure?.type === "save" && <ErrorNotice message={failure.message} />}
      <div className="mt-1 flex justify-end border-t border-[var(--border-subtle)] pt-5">
        <Button type="submit" disabled={mutation.isPending} className={`${primaryClassName} max-[901px]:w-full`}>{pending?.type === "save" ? "저장 중…" : "저장"}</Button>
      </div>
    </form>
  );

  if (!classId) return <div className="min-w-0 max-w-[744px]">{form}</div>;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_360px] items-start gap-x-8 gap-y-5 max-[901px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-5">
        {form}
        {children}
      </div>

      <aside aria-label="대표 이미지·공개·삭제" className="sticky top-[92px] flex min-w-0 flex-col gap-5 max-[901px]:static">
        <section aria-labelledby={`${prefix}-image-heading`} aria-busy={pending?.type === "image"} className={`${cardClassName} gap-3.5 p-6`}>
          <h2 id={`${prefix}-image-heading`} className="font-heading text-xl leading-[1.3] font-bold">대표 이미지</h2>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-image-placeholder)]">
            {workshop?.imageUrl ? <Image src={workshop.imageUrl} alt={`${workshop.title} 대표 이미지`} fill sizes="(max-width: 900px) 100vw, 312px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[var(--color-blurple-700)]"><Paintbrush aria-hidden="true" className="size-11" /></div>}
          </div>
          <input ref={fileInput} hidden type="file" aria-label="대표 이미지 파일" accept={ALLOWED_IMAGE_TYPES.join(",")} onChange={(event) => upload(event.target.files?.[0])} />
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => fileInput.current?.click()} className={`${smallClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`}>
            <Upload aria-hidden="true" />{pending?.type === "image" ? "업로드 중…" : workshop?.imageUrl ? "이미지 변경" : "이미지 업로드"}
          </Button>
          {imageError && <ErrorNotice message={imageError} />}
          {failure?.type === "image" && <ErrorNotice message={failure.message} />}
          <p className="text-[13px] leading-[1.45] text-[var(--text-muted)]">목록과 링크 미리보기에 쓰여요. 가로 1200px 이상 권장.</p>
        </section>

        <section aria-label="공개 설정" className={`${cardClassName} gap-3 p-6`}>
          <ToggleSwitch label="고객에게 공개" checked={isPublished} disabled={mutation.isPending} describedBy={`${prefix}-visibility-hint`} onCheckedChange={(checked) => {
            if (mutation.isPending) return;
            setFailure(null);
            mutation.mutate({ type: "visibility", isPublished: checked });
          }} />
          <p id={`${prefix}-visibility-hint`} className="text-sm text-[var(--text-muted)]">비공개 클래스는 목록에 나오지 않고 링크로도 신청할 수 없어요.</p>
          {failure?.type === "visibility" && <ErrorNotice message={failure.message} />}
        </section>

        {/* 회차 목록(children)의 다이얼로그가 중첩으로 취급돼 배경이 빠지지 않도록 삭제 카드만 감싼다. */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!mutation.isPending) setDialogOpen(open); }}>
          <section aria-labelledby={`${prefix}-delete-heading`} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6">
            <h2 id={`${prefix}-delete-heading`} className="font-heading text-[17px] leading-[1.3] font-bold">클래스 삭제</h2>
            <p className="flex items-start gap-1.5 text-[13px] leading-[1.45] text-[var(--status-danger)]"><Info aria-hidden="true" className="mt-px size-4 shrink-0" />{hasSessions ? deleteBlockedMessage : "삭제하면 되돌릴 수 없어요."}</p>
            <DialogTrigger onClick={() => setFailure(null)} render={<Button type="button" variant="ghost" disabled={mutation.isPending || hasSessions} className={`${smallClassName} bg-[var(--surface-card)] text-[var(--text-strong)] hover:bg-[var(--surface-raised)]`} />}><Trash2 aria-hidden="true" />클래스 삭제</DialogTrigger>
          </section>

          <DialogPortal>
            <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
            <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
              <DialogTitle className="pr-12 font-heading text-[28px] leading-[1.15] font-extrabold max-[641px]:text-2xl">클래스를 삭제할까요?</DialogTitle>
              <DialogDescription className="text-base text-[var(--text-body)] [overflow-wrap:anywhere]"><b className="font-semibold text-[var(--text-strong)]">{workshop?.title}</b> 클래스를 영구 삭제해요. 되돌릴 수 없어요.</DialogDescription>
              {failure?.type === "delete" && <ErrorNotice message={failure.message} />}
              <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
                <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
                <Button type="button" disabled={mutation.isPending} onClick={() => {
                  if (mutation.isPending) return;
                  setFailure(null);
                  mutation.mutate({ type: "delete" });
                }} className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}>
                  {mutation.isPending ? "처리 중…" : "삭제하기"}
                </Button>
              </div>
              <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-9 right-9 size-10 rounded-full bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)] max-[641px]:top-5 max-[641px]:right-5" />}><X aria-hidden="true" className="size-5" /></DialogClose>
            </DialogPrimitive.Popup>
          </DialogPortal>
        </Dialog>
      </aside>
    </div>
  );
}

export function AdminClassForm({ classId, children }: { classId?: string; children?: ReactNode }): JSX.Element {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["admin", "class", classId],
    queryFn: () => apiFetch<AdminClassDetail>(`/api/admin/classes/${encodeURIComponent(classId!)}`),
    enabled: Boolean(classId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) router.replace("/admin/login");
  }, [query.error, router]);
  const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";

  return (
    <div className="min-w-0 space-y-5">
      <Link href="/admin/classes" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"><ArrowLeft aria-hidden="true" className="size-[18px]" />클래스 관리</Link>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-heading text-[36px] leading-[1.15] font-extrabold tracking-[-.01em] [overflow-wrap:anywhere]">{classId ? query.data?.title ?? "클래스 편집" : "새 클래스"}</h1>
        {query.data && <Tag tone={query.data.isPublished ? "success" : "neutral"} size="md">{query.data.isPublished ? "공개 중" : "비공개"}</Tag>}
      </div>
      {classId && query.isPending && <LoadingPlaceholder label="클래스 정보를 불러오고 있습니다…" rows={3} />}
      {query.isError && <div className="space-y-3">
        <ErrorNotice message={notFound ? "클래스를 찾을 수 없어요." : `클래스 정보를 불러오지 못했어요. ${query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}`} />
        {!notFound && <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button>}
      </div>}
      {(!classId || query.data) && !notFound && <ClassEditor key={classId ?? "new"} classId={classId} workshop={query.data}>{children}</ClassEditor>}
    </div>
  );
}
