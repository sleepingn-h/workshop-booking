"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, Paintbrush, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { ALLOWED_IMAGE_TYPES, IMAGE_MAX_BYTES, validateClassInput, validateImage } from "@/lib/rules";
import { ERROR_MESSAGE, type AdminClassDetail, type FieldErrors } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const primaryClassName = `${buttonClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`;
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const cardClassName = "min-w-0 space-y-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)] max-[641px]:p-6";
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";
const imageErrorMessage = `JPEG·PNG·WebP, ${IMAGE_MAX_BYTES / (1024 * 1024)}MB 이하 이미지를 선택해 주세요.`;
const deleteErrorMessage = "회차가 있는 클래스는 삭제할 수 없어요. 비공개로 전환해 주세요";
const requiredGuidance = ["장소 — 공방 이름과 방문 주소", "소요 시간 — 예상 수강 시간", "비용과 결제 방법 — 1인 비용과 결제 방법, 무료라면 무료", "준비물 — 없으면 없음", "문의처 — 예약·취소·일정 문의 전화번호"];
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

function ClassEditor({ classId, workshop }: { classId?: string; workshop?: AdminClassDetail }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefix = useId();
  // 이미지·공개 상태 재조회로 저장 전 입력을 덮어쓰지 않는다.
  const [draft, setDraft] = useState<ClassFields | null>(null);
  const fields = draft ?? { title: workshop?.title ?? "", description: workshop?.description ?? "" };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof ClassFields>>({});
  const [failure, setFailure] = useState<{ type: Change["type"]; message: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"visibility" | "delete">("visibility");
  const path = `/api/admin/classes/${encodeURIComponent(classId ?? "")}`;
  const isPublished = workshop?.isPublished ?? false;
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
        toast.success(classId ? "클래스 정보를 저장했습니다" : "비공개 클래스를 만들었습니다");
        if (result) router.push(`/admin/classes/${encodeURIComponent(result.id)}`);
      } else if (change.type === "visibility") {
        toast.success(change.isPublished ? "클래스를 공개했습니다" : "클래스를 비공개로 전환했습니다");
      } else if (change.type === "image") {
        toast.success("대표 이미지를 저장했습니다");
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
      } else {
        toast.success("클래스를 삭제했습니다");
        router.push("/admin/classes");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (change.type === "save") setDraft(null);
    },
    onError: (error, change) => {
      const message = error instanceof ApiError
        ? error.code === "CLASS_HAS_SESSIONS" ? deleteErrorMessage : error.message
        : ERROR_MESSAGE.INTERNAL_ERROR;
      setFailure({ type: change.type, message });
      if (change.type === "save" && error instanceof ApiError && error.fields) setFieldErrors(error.fields);
      toast.error(message);
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    setFailure(null);
    const validated = validateClassInput(fields);
    if (!validated.ok) { setFieldErrors(validated.fieldErrors); return; }
    setFieldErrors({});
    mutation.mutate({ type: "save", fields: validated.value });
  }

  function upload() {
    if (mutation.isPending || !file) return;
    if (!validateImage(file).ok) { setImageError(imageErrorMessage); return; }
    setFailure(null);
    setImageError("");
    mutation.mutate({ type: "image", file });
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!mutation.isPending) setDialogOpen(open); }}>
      <div className={`grid min-w-0 items-start gap-8 ${classId ? "grid-cols-[minmax(0,1fr)_360px] max-[901px]:grid-cols-1" : "max-w-[720px] grid-cols-1"}`}>
        <form onSubmit={submit} noValidate aria-label="클래스 정보" aria-busy={mutation.isPending} className={cardClassName}>
          <h2 className="font-heading text-[28px] leading-[1.2] font-bold max-[641px]:text-2xl">기본 정보</h2>
          {!classId && <p className={noticeClassName}>새 클래스는 비공개로 만들어집니다.</p>}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${prefix}-title`} className="text-sm font-semibold text-[var(--text-strong)]">클래스 이름</Label>
            <Input id={`${prefix}-title`} name="title" value={fields.title} onChange={(event) => { setDraft({ ...fields, title: event.target.value }); setFieldErrors((errors) => ({ ...errors, title: undefined })); }} disabled={mutation.isPending} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? `${prefix}-title-error` : undefined} className={inputClassName} />
            {fieldErrors.title && <p id={`${prefix}-title-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.title}</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${prefix}-description`} className="text-sm font-semibold text-[var(--text-strong)]">클래스 설명</Label>
            <Textarea id={`${prefix}-description`} name="description" value={fields.description} onChange={(event) => { setDraft({ ...fields, description: event.target.value }); setFieldErrors((errors) => ({ ...errors, description: undefined })); }} disabled={mutation.isPending} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={`${prefix}-guidance${fieldErrors.description ? ` ${prefix}-description-error` : ""}`} className={`${inputClassName} min-h-[280px] px-4 py-3.5`} />
            {fieldErrors.description && <p id={`${prefix}-description-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.description}</p>}
            <div id={`${prefix}-guidance`} className="space-y-2 pt-2 text-sm text-[var(--text-muted)]">
              <p className="font-semibold">공개 전, 설명에 아래 안내를 모두 작성해 주세요.</p>
              <ul aria-label="설명 필수 안내 항목" className="space-y-2">
                {requiredGuidance.map((item) => <li key={item} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{item}</span></li>)}
              </ul>
            </div>
          </div>
          {classId && <p className={noticeClassName}>저장한 이름·설명은 기존 예약 조회에도 바로 반영됩니다. 자동 알림은 발송되지 않습니다.</p>}
          {failure?.type === "save" && <ErrorNotice message={failure.message} />}
          <Button type="submit" disabled={mutation.isPending} className={primaryClassName}>
            {mutation.isPending && mutation.variables?.type === "save" ? classId ? "저장 중…" : "만드는 중…" : classId ? "변경사항 저장" : "클래스 만들기"}
          </Button>
        </form>

        {classId && <aside aria-label="클래스 공개·이미지·삭제" className="sticky top-[92px] min-w-0 space-y-6 max-[901px]:static">
          <section className={cardClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-bold">공개 상태</h2>
              <Tag tone={isPublished ? "success" : "neutral"}>{isPublished ? "공개" : "비공개"}</Tag>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{isPublished ? "고객이 클래스를 조회하고 예약을 신청할 수 있습니다." : "필수 안내·이미지·회차를 준비한 뒤 공개해 주세요."}</p>
            <DialogTrigger onClick={() => { setDialogAction("visibility"); setFailure(null); }} render={<Button type="button" disabled={mutation.isPending} className={`${primaryClassName} w-full`} />}>{isPublished ? "비공개로 전환" : "공개로 전환"}</DialogTrigger>
          </section>
          <section className={cardClassName} aria-busy={mutation.isPending && mutation.variables?.type === "image"}>
            <h2 className="font-heading text-xl font-bold">대표 이미지</h2>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-image-placeholder)]">
              {workshop?.imageUrl ? <Image src={workshop.imageUrl} alt={`${workshop.title} 대표 이미지`} fill sizes="(max-width: 900px) 100vw, 296px" className="object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-[var(--color-blurple-600)]"><Paintbrush aria-hidden="true" className="size-10" /><p>등록된 이미지가 없습니다.</p></div>}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${prefix}-image`} className="text-sm font-semibold text-[var(--text-strong)]">대표 이미지 파일</Label>
              <Input ref={fileInput} id={`${prefix}-image`} name="image" type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} disabled={mutation.isPending} aria-invalid={Boolean(imageError)} aria-describedby={`${prefix}-image-hint${imageError ? ` ${prefix}-image-error` : ""}`} onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFailure(null);
                const valid = selected && validateImage(selected).ok;
                setFile(valid ? selected : null);
                setImageError(selected && !valid ? imageErrorMessage : "");
              }} className={`${inputClassName} h-auto py-3 text-sm file:mr-3 file:text-sm file:font-medium`} />
              <p id={`${prefix}-image-hint`} className="text-sm text-[var(--text-muted)]">JPEG·PNG·WebP, 4MB 이하. 클래스당 1장을 사용합니다.</p>
              {imageError && <p id={`${prefix}-image-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{imageError}</p>}
            </div>
            {failure?.type === "image" && <ErrorNotice message={failure.message} />}
            <Button type="button" disabled={mutation.isPending || !file} title={!file ? "올바른 이미지 파일을 먼저 선택해 주세요" : undefined} onClick={upload} className={`${primaryClassName} w-full`}>{mutation.isPending && mutation.variables?.type === "image" ? "업로드 중…" : "이미지 업로드"}</Button>
          </section>
          <section className={cardClassName}>
            <h2 className="font-heading text-xl font-bold">클래스 삭제</h2>
            <p className="text-sm text-[var(--text-muted)]">{workshop?.sessions.length ? deleteErrorMessage : "회차가 없는 클래스만 삭제할 수 있습니다. 삭제한 클래스는 되돌릴 수 없습니다."}</p>
            <DialogTrigger onClick={() => { setDialogAction("delete"); setFailure(null); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={`${ghostClassName} w-full`} />}>클래스 삭제</DialogTrigger>
          </section>
        </aside>}
      </div>

      <DialogPortal>
        <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
          <DialogTitle className="pr-8 font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">{dialogAction === "delete" ? "클래스를 삭제할까요?" : isPublished ? "비공개로 전환할까요?" : "클래스를 공개할까요?"}</DialogTitle>
          <DialogDescription className="text-base text-[var(--text-body)] [overflow-wrap:anywhere]">{dialogAction === "delete" ? "회차가 없는 클래스만 삭제할 수 있습니다. 삭제하면 되돌릴 수 없습니다." : isPublished ? "고객 목록·검색에서 사라지고 새 예약을 받지 않습니다. 기존 예약은 유지됩니다." : "설명에 필수 안내가 모두 있는지 확인했나요? 저장한 설명에 장소·소요 시간·비용과 결제 방법·준비물·문의처가 모두 있는지 확인해 주세요."}</DialogDescription>
          {failure?.type === dialogAction && <ErrorNotice message={failure.message} />}
          <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
            <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
            <Button type="button" disabled={mutation.isPending} onClick={() => {
              if (mutation.isPending) return;
              setFailure(null);
              mutation.mutate(dialogAction === "delete" ? { type: "delete" } : { type: "visibility", isPublished: !isPublished });
            }} className={`${dialogAction === "visibility" && !isPublished ? primaryClassName : `${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}`}>
              {mutation.isPending ? "처리 중…" : dialogAction === "delete" ? "삭제하기" : isPublished ? "비공개로 전환하기" : "공개하기"}
            </Button>
          </div>
          <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-2 right-2 size-11 text-[var(--text-strong)] hover:bg-[var(--surface-raised)]" />}><X aria-hidden="true" className="size-5" /></DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function AdminClassForm({ classId }: { classId?: string }): JSX.Element {
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
    <div className="min-w-0 space-y-6">
      <Link href="/admin/classes" className="inline-flex min-h-11 items-center gap-2 text-[var(--color-link)] hover:text-[var(--color-link-hover)]"><ArrowLeft aria-hidden="true" className="size-[18px]" />클래스 목록</Link>
      {classId && query.isPending && <p role="status" className={noticeClassName}>클래스 정보를 불러오고 있습니다…</p>}
      {query.isError && <div className="space-y-3">
        <ErrorNotice message={notFound ? "클래스를 찾을 수 없습니다." : query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR} />
        {!notFound && <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button>}
      </div>}
      {(!classId || query.data) && !notFound && <ClassEditor key={classId ?? "new"} classId={classId} workshop={query.data} />}
    </div>
  );
}
