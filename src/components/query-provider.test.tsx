import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { QueryProvider } from "./query-provider";

afterEach(cleanup);

describe("QueryProvider", () => {
  it("자식을 렌더링한다", () => {
    render(
      <QueryProvider>
        <p>공방 클래스 예약</p>
      </QueryProvider>,
    );

    expect(screen.getByText("공방 클래스 예약")).toBeInTheDocument();
  });

  it("자식이 useQueryClient로 기본 옵션이 설정된 클라이언트를 사용한다", () => {
    let client: QueryClient | undefined;

    function Consumer() {
      client = useQueryClient();
      return null;
    }

    render(
      <QueryProvider>
        <Consumer />
      </QueryProvider>,
    );

    expect(client).toBeInstanceOf(QueryClient);
    expect(client?.getDefaultOptions().queries).toMatchObject({
      retry: 1,
      refetchOnWindowFocus: false,
    });
  });

  it("재렌더링해도 같은 QueryClient와 캐시를 유지한다", () => {
    const clients: QueryClient[] = [];

    function Consumer() {
      clients.push(useQueryClient());
      return null;
    }

    const { rerender } = render(
      <QueryProvider>
        <Consumer />
      </QueryProvider>,
    );
    const initialClient = clients[0];
    initialClient.setQueryData(["example"], "cached");

    rerender(
      <QueryProvider>
        <Consumer />
      </QueryProvider>,
    );

    expect(clients).toHaveLength(2);
    expect(clients[1]).toBe(initialClient);
    expect(clients[1].getQueryData(["example"])).toBe("cached");
    initialClient.clear();
  });
});
