import {
  PrismaClient,
  QuickLinkKind,
  QuickLinkPageType,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const BCRYPT_COST = 12;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[seed] missing required env var: ${key}`);
  }
  return value;
}

/**
 * spec §3.3.6 / §3.3.7 initial quick-link dataset. Seeded only when the
 * QuickLink table is empty — re-running `prisma db seed` after admins have
 * edited/sorted entries via the UI will NOT clobber their changes.
 */
const INITIAL_QUICK_LINKS: Array<{
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
}> = [
  // ---------------- 数据表(DATA_TABLE) —— 企业内部 ----------------
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "🎓 研录学生基本情况调研清单收集结果",
    url: "https://cn1pfz1dbj.feishu.cn/sheets/YY4qsGstahcW8ktmoIIcKY70nTI?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "🎓 研录学生打卡结果查看",
    url: "https://cn1pfz1dbj.feishu.cn/base/WgIFbyTT6auY1Ose8gXcRKFgn0R?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.COPY,
    title: "🎓 信息更新及后续行课意向征集问卷链接(点击复制)",
    url: "https://cn1pfz1dbj.feishu.cn/share/base/form/shrcnEPxiYVQHh6VYdCI6wlyVbg",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "🎓 信息更新及后续行课意向征集结果",
    url: "https://cn1pfz1dbj.feishu.cn/base/UVXJbCH23aNlB5sLzrkc0xZinJ0?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.COPY,
    title: "👩‍🏫 银行卡统计问卷链接(点击复制)",
    url: "https://cn1pfz1dbj.feishu.cn/share/base/form/shrcntp445QsyBZS0FNS6dpgglb",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "👩‍🏫 银行卡统计问卷收集结果查看",
    url: "https://cn1pfz1dbj.feishu.cn/base/HkffbreBZaAHias3qxEcshlFndg?table=tblahOACLpTU2eNq&view=vewedagK2w",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "👩‍🏫 老师简历信息库(未来将弃用)",
    url: "https://cn1pfz1dbj.feishu.cn/base/KrQMbBjeTaY6kRshHHRcnYoPnzf?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "📝 学生总规划表模板",
    url: "https://cn1pfz1dbj.feishu.cn/docx/KuHpdTnSZoyd9BxEqNQcPQq6n1b?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "📝 学生月度规划模板",
    url: "https://cn1pfz1dbj.feishu.cn/docx/UjAxdd2oAoAKd3xDowUcc9xvnKb?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "💡 研录知识库",
    url: "https://cn1pfz1dbj.feishu.cn/docx/UMDvdKp5foWYPgxyGWzc05mBnhc?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "企业内部数据表",
    kind: QuickLinkKind.DOWNLOAD,
    title: "📦 模板:从Excel导入员工、学生、课程",
    url: "/templates/import.rar",
  },
  // ---------------- 数据表(DATA_TABLE) —— 高途合作 ----------------
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "高途合作数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "🎓 单项服务学生基本信息收集",
    url: "https://cn1pfz1dbj.feishu.cn/base/IrFgbrwnrawXMasShz7cRoJkn0f?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.DATA_TABLE,
    category: "高途合作数据表",
    kind: QuickLinkKind.NAVIGATE,
    title: "📋 清北&单项服务进度表",
    url: "https://gaotuedu.feishu.cn/base/GZusbVpD7a9vnXsv84nc4JOunjc?from=from_copylink",
  },
  // ---------------- SOP ----------------
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "🎯 服务全流程协同SOP",
    url: "https://cn1pfz1dbj.feishu.cn/base/IrFgbrwnrawXMasShz7cRoJkn0f?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "💼 人员招募SOP",
    url: "https://cn1pfz1dbj.feishu.cn/docx/VwjDd7TZkoIpDTx1OE1cAj9Anrb?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "💼 客户转化SOP",
    url: "https://cn1pfz1dbj.feishu.cn/docx/ZLOmd1Eeto6sRsxRv8dcnpJYnkh?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "📝 学管、规划师、授课老师工作流程图",
    url: "https://cn1pfz1dbj.feishu.cn/docx/VjWnd0zVUoz7JpxhrlIcvQE2ngf?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "📝 学管&规划师如何配合(旧版参考)",
    url: "https://cn1pfz1dbj.feishu.cn/docx/XZKOdQLtZorGN9xU4IFc4fIKnrb?from=from_copylink",
  },
  {
    pageType: QuickLinkPageType.SOP,
    category: "SOP",
    kind: QuickLinkKind.NAVIGATE,
    title: "📝 学管如何开展工作(旧版参考)",
    url: "https://cn1pfz1dbj.feishu.cn/docx/Fzutd5LXQoKiYbxKePHcbwPbnMc?from=from_copylink",
  },
];

async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  const phone = requireEnv("SEED_SUPER_ADMIN_PHONE");
  const username = requireEnv("SEED_SUPER_ADMIN_USERNAME");
  const password = requireEnv("SEED_SUPER_ADMIN_PASSWORD");

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`[seed] super admin ${phone} already exists, skipping`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.user.create({
    data: {
      phone,
      username,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
  });
  console.log(`[seed] created super admin ${phone}`);
}

async function seedQuickLinks(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.quickLink.count();
  if (existing > 0) {
    console.log(
      `[seed] quick-links already populated (${existing} rows), skipping`,
    );
    return;
  }
  // sortOrder 按 (pageType, category) 分组从 1 递增。
  const counters = new Map<string, number>();
  const rows = INITIAL_QUICK_LINKS.map((item) => {
    const key = `${item.pageType}:${item.category}`;
    const nextOrder = (counters.get(key) ?? 0) + 1;
    counters.set(key, nextOrder);
    return { ...item, sortOrder: nextOrder };
  });
  await prisma.quickLink.createMany({ data: rows });
  console.log(`[seed] inserted ${rows.length} quick-links`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedSuperAdmin(prisma);
    await seedQuickLinks(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
