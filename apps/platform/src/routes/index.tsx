import { createFileRoute } from "@tanstack/react-router";
import { Homepage } from "@/marketing/homepage";

export const Route = createFileRoute("/")({ component: Homepage });
