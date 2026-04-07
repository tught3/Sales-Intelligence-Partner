import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 페이지를 찾을 수 없습니다</h1>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            요청하신 페이지가 존재하지 않습니다.
          </p>
          <Button className="mt-4" onClick={() => setLocation("/")}>
            대시보드로 이동
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
