"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";

import { signOut } from "@/modules/auth/actions";

import {
  BadgeIcon,
  CloseIcon,
  DogIcon,
  HistoryIcon,
  KennelIcon,
  MenuIcon,
  OverviewIcon,
  UsersIcon,
} from "./admin-nav-icons";

/**
 * Navegação do painel administrativo — o primeiro `<nav>` do projeto.
 *
 * Desktop (`sm:` e acima): sidebar fixa, sempre visível, sem colapso — só
 * mobile precisa colapsar (pedido explícito). Mobile: barra superior com ☰
 * abre uma gaveta por cima do conteúdo. SEM framer-motion: é chrome só de
 * admin, fora do caminho crítico público que justifica o lazy-load da busca
 * (ver `search/components/kennel-search.tsx`) — um toggle de estado e CSS
 * bastam. A gaveta só MONTA quando aberta (nada de `display:none` residual);
 * fechar é desmontar, então não há foco nem link alcançável escondido atrás
 * dela.
 *
 * `usePathname()` exige Client Component — é o ÚNICO client island do shell
 * inteiro. Toda página de seção continua Server Component puro.
 */

type NavItem = { href: string; label: string; Icon: ComponentType<{ className?: string }> };

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Visão geral", Icon: OverviewIcon },
  { href: "/admin/usuarios", label: "Usuários", Icon: UsersIcon },
  { href: "/admin/canis", label: "Canis", Icon: KennelIcon },
  { href: "/admin/caes", label: "Cães", Icon: DogIcon },
  { href: "/admin/selo-fundador", label: "Selo Fundador", Icon: BadgeIcon },
  { href: "/admin/historico", label: "Histórico", Icon: HistoryIcon },
];

/** `/admin` só fica ativo na rota exata — senão "Visão geral" nunca apagaria. */
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  onNavigate,
  linkRef,
}: {
  pathname: string;
  onNavigate?: () => void;
  linkRef?: (el: HTMLAnchorElement | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon }, index) => {
        const active = isActiveRoute(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              ref={index === 0 ? linkRef : undefined}
              aria-current={active ? "page" : undefined}
              className={`rounded-control flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-accent bg-surface-hover text-fg font-medium"
                  : "border-transparent text-fg-muted hover:bg-surface-hover hover:text-fg"
              }`}
            >
              <Icon className="shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SignOutRow() {
  return (
    <form action={signOut} className="border-border border-t p-3">
      <button
        type="submit"
        className="text-fg-muted hover:text-fg rounded-control w-full px-3 py-2 text-left text-sm transition-colors"
      >
        Sair
      </button>
    </form>
  );
}

function Logo() {
  return (
    <Image
      src="/brand/logo-header.png"
      alt="OrigemX"
      width={662}
      height={132}
      className="h-6 w-auto"
    />
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Foco entra na gaveta ao abrir, volta pro gatilho ao fechar — sem isso o
  // teclado perderia o lugar assim que a gaveta desmonta.
  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* Desktop: sidebar fixa */}
      <aside className="border-border bg-surface hidden w-60 shrink-0 flex-col border-r sm:flex">
        <div className="border-border flex flex-col gap-1 border-b px-4 py-4">
          <Logo />
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Admin
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks pathname={pathname} />
        </nav>
        <SignOutRow />
      </aside>

      {/* Mobile: barra superior */}
      <div className="border-border bg-surface flex items-center gap-3 border-b px-4 py-3 sm:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="text-fg-muted hover:text-fg focus-visible:outline-ring rounded-control flex size-9 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <MenuIcon />
        </button>
        <Logo />
      </div>

      {/* Gaveta mobile — só existe no DOM quando aberta. */}
      {open ? (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="bg-overlay absolute inset-0"
          />
          <aside className="bg-surface border-border relative flex h-full w-72 max-w-[80vw] flex-col border-r">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="text-fg-muted hover:text-fg focus-visible:outline-ring rounded-control flex size-9 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <CloseIcon />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <NavLinks
                pathname={pathname}
                onNavigate={() => setOpen(false)}
                linkRef={(el) => {
                  firstLinkRef.current = el;
                }}
              />
            </nav>
            <SignOutRow />
          </aside>
        </div>
      ) : null}
    </>
  );
}
