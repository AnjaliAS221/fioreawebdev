const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

const categoryInfo = async (req,res)=>{
    try {
        
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page -1 )* limit;

        

        const categoryData = await Category.find({})
        .sort({createdAt: -1})
        .skip(skip)
        .limit(limit);
        
        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("category",{
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            messages: req.flash()
           
        });
    } catch (error) {
        console.error(error);
        res.redirect("/admin/pageerror");
    }
}
const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }

        const newCategory = new Category({ name, description });
        await newCategory.save();

        return res.status(200).json({ message: 'Category added successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};



  

const addCategoryOffer = async (req, res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);

        if (!category) {
            req.flash("error", "Category not found.");
            return res.redirect("/admin/category");
        }

        const products = await Product.find({ category: category._id });
        const hasProductOffer = products.some((product) => product.productOffer > percentage);

        if (hasProductOffer) {
            req.flash("error", "Products within this category already have a product offer.");
            return res.redirect("/admin/category");
        }

        await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

        for (const product of products) {
            product.productOffer = 0;
            product.salePrice = product.regularPrice;
            await product.save();
        }

        req.flash("success", "Offer added successfully!");
        res.json({ status: 'success', message: "Offer added successfully!" }); 
    } catch (error) {
        console.error(error);
        req.flash("error", "Internal server error.");
        res.json({ status: 'error', message: "Internal server error." }); 
    }
};


const removeCategoryOffer = async (req, res) => {
    try {
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);

        if (!category) {
            req.flash("error", "Category not found.");
            return res.redirect("/admin/category");
        }

        const percentage = category.categoryOffer;
        const products = await Product.find({ category: category._id });

        if (products.length > 0) {
            for (const product of products) {
                product.salePrice += Math.floor(product.regularPrice * (percentage / 100));
                product.productOffer = 0;
                await product.save();
            }
        }

        category.categoryOffer = 0;
        await category.save();

        req.flash("success", "Offer removed successfully!");
        res.json({ status: 'success', message: "Offer removed successfully!" }); 
    } catch (error) {
        console.error(error);
        req.flash("error", "Internal server error.");
        res.json({ status: 'error', message: "Internal server error." }); 
    }
};




const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        
        req.flash('success', 'Category unlisted successfully');
        res.redirect("/admin/category");
    } catch (error) {
        req.flash('error', 'Error while unlisting category');
        res.redirect("/admin/category");
    }
};

const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        
        req.flash('success', 'Category listed successfully');
        res.redirect("/admin/category");
    } catch (error) {
        req.flash('error', 'Error while listing category');
        res.redirect("/admin/category");
    }
};


const getEditCategory = async (req,res)=>{
    try {
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        res.render("edit-category",{category:category});
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { categoryName, description, parentCategoryId } = req.body;

        const existingCategory = await Category.findOne({ name: categoryName });
        if (existingCategory) {
            req.flash('error', 'Category exists, please choose another one');
            return res.redirect(`/admin/edit-category?id=${id}`);
        }

        const updateCategory = await Category.findByIdAndUpdate(id, {
            name: categoryName,
            description: description,
            parentCategory: parentCategoryId
        }, { new: true });

        if (updateCategory) {
            req.flash('success', 'Category updated successfully');
            res.redirect("/admin/category");
        } else {
            req.flash('error', 'Category not found');
            res.redirect("/admin/category");
        }
    } catch (error) {
        req.flash('error', 'Internal server error');
        res.redirect("/admin/category");
    }
};


module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
}