<?php

declare(strict_types=1);

namespace Koriym\AlpsEditor;

final class InvalidXsdMessage
{
    /** @return array{0: string, 1: string} */
    public function getLine(string $message): array
    {
        $pattern = '/^(.+) in (.+):(.+)$/';

        if (preg_match($pattern, $message, $matches)) {
            return [$matches[1], $matches[3]];
        }

        return ['', '0'];
    }
}
