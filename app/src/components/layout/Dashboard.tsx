'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SearchPanel from '@/components/pane1/SearchPanel';
import PassageReview from '@/components/pane2/PassageReview';
import QuestionGeneration from '@/components/pane3/QuestionGeneration';

export default function Dashboard() {
  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            Ricefarm Engine
          </h1>
          <span className="text-xs text-zinc-500">Curated Workbench</span>
        </div>
        <div className="text-xs text-zinc-600">v1.0</div>
      </header>

      {/* Main: 3-pane layout on desktop, tabs on smaller screens */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop: side-by-side panes */}
        <div className="hidden lg:flex h-full">
          <div className="w-[320px] min-w-[280px] border-r border-zinc-800 overflow-y-auto">
            <SearchPanel />
          </div>
          <div className="flex-1 min-w-0 border-r border-zinc-800 overflow-y-auto">
            <PassageReview />
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto">
            <QuestionGeneration />
          </div>
        </div>

        {/* Mobile/Tablet: tabbed view */}
        <div className="lg:hidden h-full">
          <Tabs defaultValue="search" className="flex flex-col h-full">
            <TabsList className="mx-4 mt-2 bg-zinc-900">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="passages">Passages</TabsTrigger>
              <TabsTrigger value="questions">Questions</TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="flex-1 overflow-y-auto">
              <SearchPanel />
            </TabsContent>
            <TabsContent value="passages" className="flex-1 overflow-y-auto">
              <PassageReview />
            </TabsContent>
            <TabsContent value="questions" className="flex-1 overflow-y-auto">
              <QuestionGeneration />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
