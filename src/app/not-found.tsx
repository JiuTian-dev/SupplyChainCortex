import { FileQuestion, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <FileQuestion className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">404 - 页面未找到</h2>
          <p className="text-muted-foreground">
            您访问的页面不存在或已被移除。
          </p>
        </div>
        <Link href="/">
          <Button className="gap-2">
            <Home className="h-4 w-4" />
            返回首页
          </Button>
        </Link>
      </div>
    </div>
  );
}
