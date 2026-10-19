"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { ERROR_MESSAGE } from "@/lib/types";

export function AdminLoginForm(): JSX.Element {
  const router = useRouter();
  const prefix = useId();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState("");
  const mutation = useMutation({
    mutationFn: (password: string) => apiFetch("/api/admin/login", { method: "POST", json: { password } }),
    onSuccess: () => {
      // 현재 화면의 refresh가 뒤따르는 이동을 덮지 않도록 인증 상태부터 갱신한다.
      router.refresh();
      router.replace("/admin");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();
    if (!password) {
      setFieldError("비밀번호를 입력해 주세요.");
      return;
    }
    setFieldError("");
    mutation.mutate(password);
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="운영자 로그인" aria-busy={mutation.isPending} className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-password`} className="text-sm font-semibold text-[var(--text-strong)]">비밀번호</Label>
        <Input
          id={`${prefix}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={mutation.isPending}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${prefix}-error` : undefined}
          className="min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 aria-invalid:border-[var(--status-danger)] disabled:bg-[var(--surface-sunk)] md:text-base"
        />
        {fieldError && <p id={`${prefix}-error`} className="text-[13px] font-medium text-[var(--status-danger)]">{fieldError}</p>}
      </div>
      {mutation.isError && (
        <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <p className="min-w-0 [overflow-wrap:anywhere]">{mutation.error instanceof ApiError
            ? mutation.error.status === 401 ? "비밀번호가 올바르지 않습니다" : mutation.error.message
            : ERROR_MESSAGE.INTERNAL_ERROR}</p>
        </div>
      )}
      <Button type="submit" disabled={mutation.isPending} className="h-auto min-h-11 w-full rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100">
        {mutation.isPending ? "로그인 중…" : "로그인"}
      </Button>
    </form>
  );
}
