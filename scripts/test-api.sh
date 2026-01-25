#!/bin/bash

# JSON Base API 测试脚本
# 测试资源 CRUD 和文件上传下载功能

# 不使用 set -e，避免中途退出时无法执行清理

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 默认配置
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8788}"
BUCKET_NAME="${BUCKET_NAME:-test_bucket}"
API_KEY="${API_KEY:-}"
TEST_DIR="${TEST_DIR:-/tmp/jsonbase_test}"
VERBOSE="${VERBOSE:-false}"
CLEANUP_AFTER="${CLEANUP_AFTER:-true}"

# 测试统计
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# 打印函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

print_header() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}========================================${NC}"
}

# 退出处理
cleanup_on_exit() {
    if [ "$CLEANUP_AFTER" = "true" ] && [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
    fi
}

trap cleanup_on_exit EXIT

# 检查依赖
check_dependencies() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         JSON Base API 测试脚本 v1.0            ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
    echo ""

    local deps=("curl" "jq")
    local missing=()

    for dep in "${deps[@]}"; do
        if ! command -v $dep &> /dev/null; then
            missing+=("$dep")
        fi
    done

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} 缺少依赖: ${missing[*]}"
        echo ""
        echo "请安装依赖:"
        echo "  macOS: brew install ${missing[*]}"
        echo "  Linux: apt install ${missing[*]}"
        exit 1
    fi

    echo -e "${GREEN}[OK]${NC} 所有依赖已安装 (curl, jq)"
}

# 检查配置
check_config() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}检查配置${NC}"
    echo -e "${YELLOW}========================================${NC}"

    if [ -z "$API_KEY" ]; then
        echo ""
        echo -e "${RED}[ERROR]${NC} API_KEY 未设置!"
        echo ""
        echo "使用方法:"
        echo ""
        echo "  方式 1: 使用 -k 参数"
        echo -e "    ${CYAN}./scripts/test-api.sh -k YOUR_API_KEY${NC}"
        echo ""
        echo "  方式 2: 使用环境变量"
        echo -e "    ${CYAN}export API_KEY=YOUR_API_KEY${NC}"
        echo -e "    ${CYAN}./scripts/test-api.sh${NC}"
        echo ""
        echo "  方式 3: 组合使用"
        echo -e "    ${CYAN}API_KEY=YOUR_API_KEY ./scripts/test-api.sh -u https://your-worker.workers.dev${NC}"
        echo ""
        echo "可选参数:"
        echo "  -u, --url URL       Worker URL (默认: http://127.0.0.1:8788)"
        echo "  -b, --bucket NAME   Bucket 名称 (默认: test_bucket)"
        echo "  -v, --verbose       详细输出"
        echo "  --no-cleanup        测试后不清理数据"
        echo ""
        echo "当前配置:"
        echo "  WORKER_URL: $WORKER_URL"
        echo "  BUCKET:     $BUCKET_NAME"
        echo "  API_KEY:    (未设置)"
        exit 1
    fi

    echo ""
    echo "  WORKER_URL: $WORKER_URL"
    echo "  BUCKET:     $BUCKET_NAME"
    echo "  API_KEY:    ${API_KEY:0:8}..."
    echo ""
    echo -e "${GREEN}[OK]${NC} 配置检查通过"
}

# 创建测试目录
setup_test_dir() {
    print_header "准备测试环境"

    rm -rf "$TEST_DIR"
    mkdir -p "$TEST_DIR"

    print_info "测试目录: $TEST_DIR"
}

# 清理测试数据
cleanup() {
    print_header "清理测试数据"

    # 删除测试资源
    curl -s -X DELETE "$WORKER_URL/$BUCKET_NAME/test_json" \
        -H "Authorization: Bearer $API_KEY" || true

    curl -s -X DELETE "$WORKER_URL/$BUCKET_NAME/test_text" \
        -H "Authorization: Bearer $API_KEY" || true

    curl -s -X DELETE "$WORKER_URL/$BUCKET_NAME/test_file.txt" \
        -H "Authorization: Bearer $API_KEY" || true

    curl -s -X DELETE "$WORKER_URL/$BUCKET_NAME/test_upload.svg" \
        -H "Authorization: Bearer $API_KEY" || true

    rm -rf "$TEST_DIR"

    print_success "清理完成"
}

# 测试健康检查
test_health() {
    print_header "测试健康检查"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" "$WORKER_URL/._jsondb_/api/health" \
        -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)

    if [ "$status" = "200" ]; then
        print_success "健康检查通过 (HTTP $status)"
        [ "$VERBOSE" = "true" ] && echo "$response" | head -1 | jq .
    else
        print_fail "健康检查失败 (HTTP $status)"
    fi
}

# 测试 JSON 创建 (POST)
test_json_create() {
    print_header "测试 JSON 创建 (POST)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/$BUCKET_NAME/test_json" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"hello": "world", "number": 42, "boolean": true}' 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "201" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "JSON 创建成功"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "JSON 创建失败: $body"
        fi
    else
        print_fail "JSON 创建失败 (HTTP $status): $body"
    fi
}

# 测试 JSON 读取 (GET)
test_json_read() {
    print_header "测试 JSON 读取 (GET)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X GET "$WORKER_URL/$BUCKET_NAME/test_json" \
        -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "200" ]; then
        local hello=$(echo "$body" | jq -r '.hello' 2>/dev/null || echo "")
        if [ "$hello" = "world" ]; then
            print_success "JSON 读取成功: hello=world"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "JSON 读取失败: $body"
        fi
    else
        print_fail "JSON 读取失败 (HTTP $status): $body"
    fi
}

# 测试 JSON 更新 (PUT)
test_json_update() {
    print_header "测试 JSON 更新 (PUT)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X PUT "$WORKER_URL/$BUCKET_NAME/test_json" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"hello": "updated", "number": 100}' 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "200" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "JSON 更新成功"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "JSON 更新失败: $body"
        fi
    else
        print_fail "JSON 更新失败 (HTTP $status): $body"
    fi
}

# 测试文本创建
test_text_create() {
    print_header "测试文本创建 (POST)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/$BUCKET_NAME/test_text" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: text/plain" \
        -d 'Hello World from JSON Base!' 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "201" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "文本创建成功"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "文本创建失败: $body"
        fi
    else
        print_fail "文本创建失败 (HTTP $status): $body"
    fi
}

# 测试文本读取
test_text_read() {
    print_header "测试文本读取 (GET)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X GET "$WORKER_URL/$BUCKET_NAME/test_text" \
        -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "200" ]; then
        if [ "$body" = "Hello World from JSON Base!" ]; then
            print_success "文本读取成功: $body"
        else
            print_fail "文本读取失败: 期望 'Hello World from JSON Base!'，得到 '$body'"
        fi
    else
        print_fail "文本读取失败 (HTTP $status): $body"
    fi
}

# 测试文件上传
test_file_upload() {
    print_header "测试文件上传 (POST)"

    # 创建测试 SVG 文件
    cat > "$TEST_DIR/test_file.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
  <text x="50" y="55" text-anchor="middle" fill="white" font-size="14">TEST</text>
</svg>
EOF

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/$BUCKET_NAME/test_upload.svg" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: image/svg+xml" \
        --data-binary @"$TEST_DIR/test_file.svg" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "201" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "文件上传成功 (SVG)"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "文件上传失败: $body"
        fi
    else
        print_fail "文件上传失败 (HTTP $status): $body"
    fi
}

# 测试文件下载
test_file_download() {
    print_header "测试文件下载 (GET)"

    local temp_file="$TEST_DIR/download_response.txt"
    local http_code
    local content_type

    # 使用临时文件保存响应，避免多行解析问题
    curl -s -D "$temp_file" -X GET "$WORKER_URL/$BUCKET_NAME/test_upload.svg" \
        -H "Authorization: Bearer $API_KEY" -o "$TEST_DIR/downloaded_file.svg" 2>/dev/null || true

    http_code=$(grep -i "^HTTP" "$temp_file" | tail -1 | awk '{print $2}')
    content_type=$(grep -i "^content-type:" "$temp_file" | tail -1 | sed 's/content-type: *//i' | tr -d '\r')

    if [ "$http_code" = "200" ]; then
        if echo "$content_type" | grep -q "image/svg+xml"; then
            if grep -q "TEST" "$TEST_DIR/downloaded_file.svg" 2>/dev/null; then
                print_success "文件下载成功 (SVG, Content-Type: $content_type)"
                [ "$VERBOSE" = "true" ] && cat "$TEST_DIR/downloaded_file.svg"
            else
                print_fail "文件下载失败: 文件内容不正确"
            fi
        else
            print_fail "文件下载失败: Content-Type 不正确 (期望 image/svg+xml，得到 $content_type)"
        fi
    else
        print_fail "文件下载失败 (HTTP $http_code)"
    fi

    rm -f "$temp_file"
}

# 测试使用 @data-binary 上传文件
test_file_upload_binary() {
    print_header "测试 @data-binary 文件上传"

    # 创建测试文本文件
    echo "This is a test file uploaded with @data-binary" > "$TEST_DIR/binary_test.txt"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/$BUCKET_NAME/test_file.txt" \
        -H "Authorization: Bearer $API_KEY" \
        --data-binary @"$TEST_DIR/binary_test.txt" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "201" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "@data-binary 文件上传成功"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "@data-binary 文件上传失败: $body"
        fi
    else
        print_fail "@data-binary 文件上传失败 (HTTP $status): $body"
    fi
}

# 测试删除资源 (DELETE)
test_delete() {
    print_header "测试资源删除 (DELETE)"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X DELETE "$WORKER_URL/$BUCKET_NAME/test_text" \
        -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$status" = "200" ]; then
        local msg=$(echo "$body" | jq -r '.message' 2>/dev/null || echo "")
        if [ "$msg" = "storage ok" ]; then
            print_success "资源删除成功"
            [ "$VERBOSE" = "true" ] && echo "$body" | jq .
        else
            print_fail "资源删除失败: $body"
        fi
    else
        print_fail "资源删除失败 (HTTP $status): $body"
    fi
}

# 测试删除后资源不存在
test_delete_verification() {
    print_header "验证删除后的资源状态"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X GET "$WORKER_URL/$BUCKET_NAME/test_text" \
        -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)

    if [ "$status" = "404" ]; then
        print_success "已删除资源返回 404（正确）"
    else
        print_fail "已删除资源应返回 404，实际返回 $status"
    fi
}

# 测试认证失败
test_auth_failure() {
    print_header "测试认证失败场景"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X GET "$WORKER_URL/$BUCKET_NAME/test_json" \
        -H "Authorization: Bearer invalid_key" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)

    if [ "$status" = "401" ]; then
        print_success "无效 Token 返回 401（正确）"
    else
        print_fail "无效 Token 应返回 401，实际返回 $status"
    fi
}

# 测试缺少认证
test_no_auth() {
    print_header "测试缺少认证场景"

    local response
    local status

    response=$(curl -s -w "\n%{http_code}" -X GET "$WORKER_URL/$BUCKET_NAME/test_json" 2>/dev/null || echo "")

    status=$(echo "$response" | tail -1)

    if [ "$status" = "401" ]; then
        print_success "无认证返回 401（正确）"
    else
        print_fail "无认证应返回 401，实际返回 $status"
    fi
}

# 打印测试总结
print_summary() {
    print_header "测试总结"

    echo ""
    echo -e "总测试数: ${TESTS_TOTAL}"
    echo -e "${GREEN}通过: ${TESTS_PASSED}${NC}"
    echo -e "${RED}失败: ${TESTS_FAILED}${NC}"
    echo ""

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}所有测试通过!${NC}"
        return 0
    else
        echo -e "${RED}存在失败的测试${NC}"
        return 1
    fi
}

# 显示帮助信息
show_help() {
    cat << EOF
JSON Base API 测试脚本

用法: $0 [选项]

选项:
    -h, --help              显示帮助信息
    -v, --verbose           输出详细信息
    -u, --url URL           设置 Worker URL (默认: https://worker-json-base.your.workers.dev)
    -k, --key API_KEY       设置 API Key
    -b, --bucket BUCKET     设置 Bucket 名称 (默认: test_bucket)
    -d, --dir DIR           设置测试目录 (默认: /tmp/jsonbase_test)
    -c, --cleanup           测试后清理数据
    --no-cleanup            不清理数据 (默认: 清理)

示例:
    $0 -k your_api_key
    $0 -k your_api_key -u https://your-worker.workers.dev -v
    $0 -k your_api_key --cleanup
    $0 -k your_api_key --no-cleanup

环境变量:
    WORKER_URL      Worker URL
    API_KEY         API Key
    BUCKET_NAME     Bucket 名称
    TEST_DIR        测试目录
    VERBOSE         详细输出 (true/false)

EOF
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -u|--url)
                WORKER_URL="$2"
                shift 2
                ;;
            -k|--key)
                API_KEY="$2"
                shift 2
                ;;
            -b|--bucket)
                BUCKET_NAME="$2"
                shift 2
                ;;
            -d|--dir)
                TEST_DIR="$2"
                shift 2
                ;;
            -c|--cleanup)
                CLEANUP_AFTER="true"
                shift
                ;;
            --no-cleanup)
                CLEANUP_AFTER="false"
                shift
                ;;
            *)
                echo "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# 主函数
main() {
    parse_args "$@"

    check_dependencies
    check_config
    setup_test_dir

    # CRUD 测试
    test_health
    test_json_create
    test_json_read
    test_json_update
    test_text_create
    test_text_read

    # 文件上传下载测试
    test_file_upload
    test_file_download
    test_file_upload_binary

    # 删除测试
    test_delete
    test_delete_verification

    # 认证测试
    test_auth_failure
    test_no_auth

    # 清理
    if [ "$CLEANUP_AFTER" = "true" ]; then
        cleanup
    fi

    print_summary
}

main "$@"
